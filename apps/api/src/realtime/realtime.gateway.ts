import { Logger, UseFilters, UsePipes, ValidationPipe } from '@nestjs/common';
import {
  ConnectedSocket,
  MessageBody,
  OnGatewayConnection,
  OnGatewayDisconnect,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
  WsException,
} from '@nestjs/websockets';
import type { Server, Socket } from 'socket.io';
import type { AuthenticatedUser } from '../common/interfaces/authenticated-user.interface';
import { AuthService } from '../modules/auth/auth.service';
import { ConversationsService } from '../modules/conversations/conversations.service';
import { MessageResponseDto } from '../modules/messages/dto/message-response.dto';
import { MessagesService } from '../modules/messages/messages.service';
import { WorkspaceMembersService } from '../modules/workspace-members/workspace-members.service';
import { ConnectionRegistryService } from './connection-registry.service';
import { ConversationRoomDto, SendMessageWsDto } from './dto/ws-payloads.dto';
import {
  CLIENT_EVENTS,
  conversationRoom,
  SERVER_EVENTS,
} from './realtime.events';
import { SocketRateLimiter } from './socket-rate-limiter';
import { WsExceptionsFilter } from './ws-exceptions.filter';

type AuthenticatedSocket = Socket & { data: { user: AuthenticatedUser } };

type SendMessageAck =
  | { message: MessageResponseDto }
  | { error: string };

/**
 * Transport layer only: every business decision (tenancy, resolved
 * conversations, snooze reopening, persistence) lives in the existing
 * services — the gateway authenticates, authorizes room access, delegates,
 * and broadcasts. No repository is touched here and no business state is
 * held in memory, so instances stay interchangeable.
 *
 * Horizontal scaling: rooms currently live in this process's Socket.IO
 * server. With a second instance, install @socket.io/redis-adapter in a
 * custom IoAdapter (main.ts) over the existing Upstash connection so
 * room broadcasts fan out across instances. Nothing in this class changes.
 */
@WebSocketGateway({ cors: { origin: true, credentials: true } })
@UseFilters(new WsExceptionsFilter())
@UsePipes(
  new ValidationPipe({
    whitelist: true,
    transform: true,
    exceptionFactory: (errors) =>
      new WsException(
        Object.values(errors[0]?.constraints ?? {})[0] ?? 'Invalid payload',
      ),
  }),
)
export class RealtimeGateway
  implements OnGatewayConnection, OnGatewayDisconnect
{
  @WebSocketServer()
  private readonly server: Server;

  private readonly logger = new Logger(RealtimeGateway.name);
  private readonly limiter = new SocketRateLimiter();

  constructor(
    private readonly authService: AuthService,
    private readonly conversationsService: ConversationsService,
    private readonly workspaceMembersService: WorkspaceMembersService,
    private readonly messagesService: MessagesService,
    private readonly connectionRegistry: ConnectionRegistryService,
  ) {}

  /** Handshake auth: `io(url, { auth: { token } })` with the JWT access token. */
  async handleConnection(client: Socket): Promise<void> {
    const token: unknown = client.handshake.auth?.token;
    const user =
      typeof token === 'string'
        ? await this.authService.verifyAccessToken(token)
        : null;

    if (!user) {
      this.logger.warn(`socket ${client.id} rejected: invalid token`);
      client.emit(SERVER_EVENTS.messageError, { message: 'Unauthorized' });
      client.disconnect(true);
      return;
    }

    client.data.user = user;
    this.connectionRegistry.add(user.id, client.id);
    this.logger.log(`socket ${client.id} connected (user ${user.id})`);
  }

  /** Socket.IO removes the socket from all rooms itself on disconnect. */
  handleDisconnect(client: AuthenticatedSocket): void {
    const user = client.data.user;
    if (user) {
      this.connectionRegistry.remove(user.id, client.id);
      this.logger.log(`socket ${client.id} disconnected (user ${user.id})`);
    }
  }

  @SubscribeMessage(CLIENT_EVENTS.joinConversation)
  async joinConversation(
    @ConnectedSocket() client: AuthenticatedSocket,
    @MessageBody() payload: ConversationRoomDto,
  ): Promise<void> {
    this.throttle(client, CLIENT_EVENTS.joinConversation, 20, 10_000);
    await this.authorizeConversation(client, payload.conversationId);

    await client.join(conversationRoom(payload.conversationId));
    client.emit(SERVER_EVENTS.conversationJoined, {
      conversationId: payload.conversationId,
    });
  }

  @SubscribeMessage(CLIENT_EVENTS.leaveConversation)
  async leaveConversation(
    @ConnectedSocket() client: AuthenticatedSocket,
    @MessageBody() payload: ConversationRoomDto,
  ): Promise<void> {
    await client.leave(conversationRoom(payload.conversationId));
    client.emit(SERVER_EVENTS.conversationLeft, {
      conversationId: payload.conversationId,
    });
  }

  /**
   * Errors are returned in the ack (so the sender's optimistic UI can roll
   * back deterministically) and additionally emitted as messageError.
   */
  @SubscribeMessage(CLIENT_EVENTS.sendMessage)
  async sendMessage(
    @ConnectedSocket() client: AuthenticatedSocket,
    @MessageBody() payload: SendMessageWsDto,
  ): Promise<SendMessageAck> {
    try {
      this.throttle(client, CLIENT_EVENTS.sendMessage, 10, 10_000);
      const workspaceId = await this.authorizeConversation(
        client,
        payload.conversationId,
      );

      const message = await this.messagesService.createAgentMessage(
        client.data.user,
        workspaceId,
        payload.conversationId,
        { content: payload.content },
      );

      const room = conversationRoom(payload.conversationId);
      this.server.to(room).emit(SERVER_EVENTS.messageCreated, message);
      if (!client.rooms.has(room)) {
        // Sender must always receive the event, joined or not.
        client.emit(SERVER_EVENTS.messageCreated, message);
      }
      return { message };
    } catch (error) {
      const message = this.errorMessage(error);
      client.emit(SERVER_EVENTS.messageError, {
        event: CLIENT_EVENTS.sendMessage,
        conversationId: payload.conversationId,
        message,
      });
      return { error: message };
    }
  }

  @SubscribeMessage(CLIENT_EVENTS.typingStart)
  typingStart(
    @ConnectedSocket() client: AuthenticatedSocket,
    @MessageBody() payload: ConversationRoomDto,
  ): void {
    this.broadcastTyping(client, payload, SERVER_EVENTS.typingStarted);
  }

  @SubscribeMessage(CLIENT_EVENTS.typingStop)
  typingStop(
    @ConnectedSocket() client: AuthenticatedSocket,
    @MessageBody() payload: ConversationRoomDto,
  ): void {
    this.broadcastTyping(client, payload, SERVER_EVENTS.typingStopped);
  }

  /** Reserved for the read-receipts milestone — accepted, never processed. */
  @SubscribeMessage(CLIENT_EVENTS.markConversationRead)
  markConversationRead(): void {}

  /**
   * Typing is transient: gated on room membership (already authorized at
   * join — no DB hit per keystroke), broadcast to everyone except the
   * sender, never persisted. Excess events are dropped silently; erroring
   * on a typing indicator would be noisier than the spam itself.
   */
  private broadcastTyping(
    client: AuthenticatedSocket,
    payload: ConversationRoomDto,
    event: string,
  ): void {
    if (!this.limiter.allow(client, 'typing', 15, 5_000)) return;

    const room = conversationRoom(payload.conversationId);
    if (!client.rooms.has(room)) return;

    client.to(room).emit(event, {
      conversationId: payload.conversationId,
      userId: client.data.user.id,
      name: client.data.user.name,
    });
  }

  /**
   * Tenancy gate: the conversation's workspace must have the caller as a
   * member. Returns the workspaceId for the follow-up service call.
   */
  private async authorizeConversation(
    client: AuthenticatedSocket,
    conversationId: string,
  ): Promise<string> {
    const workspaceId =
      await this.conversationsService.getWorkspaceId(conversationId);
    if (!workspaceId) {
      throw new WsException('Conversation not found');
    }

    const membership = await this.workspaceMembersService.findMembership(
      workspaceId,
      client.data.user.id,
    );
    if (!membership) {
      throw new WsException('You do not have access to this conversation');
    }
    return workspaceId;
  }

  private throttle(
    client: AuthenticatedSocket,
    event: string,
    maxEvents: number,
    windowMs: number,
  ): void {
    if (!this.limiter.allow(client, event, maxEvents, windowMs)) {
      throw new WsException('Too many requests — slow down.');
    }
  }

  private errorMessage(error: unknown): string {
    if (error instanceof WsException) {
      const err = error.getError();
      return typeof err === 'string' ? err : error.message;
    }
    if (error instanceof Error && error.message) {
      return error.message;
    }
    return 'Something went wrong';
  }
}
