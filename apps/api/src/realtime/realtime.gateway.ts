import { Logger, UseFilters, UsePipes, ValidationPipe } from '@nestjs/common';
import {
  ConnectedSocket,
  MessageBody,
  OnGatewayConnection,
  OnGatewayDisconnect,
  OnGatewayInit,
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
import type { VisitorPrincipal } from '../modules/widget/interfaces/visitor-principal.interface';
import { WidgetAuthService } from '../modules/widget/widget-auth.service';
import { WorkspaceMembersService } from '../modules/workspace-members/workspace-members.service';
import { ConnectionRegistryService } from './connection-registry.service';
import { RealtimeEmitterService } from './realtime-emitter.service';
import {
  ConversationRoomDto,
  SendMessageWsDto,
  WorkspaceRoomDto,
} from './dto/ws-payloads.dto';
import {
  CLIENT_EVENTS,
  conversationRoom,
  SERVER_EVENTS,
  workspaceRoom,
} from './realtime.events';
import { SocketRateLimiter } from './socket-rate-limiter';
import { WsExceptionsFilter } from './ws-exceptions.filter';

/**
 * Two principals share one gateway: dashboard agents (JWT access token in
 * `auth.token`) and anonymous widget visitors (visitor token in
 * `auth.visitorToken`). Exactly one is set per socket.
 */
interface SocketPrincipals {
  user?: AuthenticatedUser;
  visitor?: VisitorPrincipal;
}

type GatewaySocket = Socket & { data: SocketPrincipals };

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
  implements OnGatewayInit, OnGatewayConnection, OnGatewayDisconnect
{
  @WebSocketServer()
  private readonly server: Server;

  private readonly logger = new Logger(RealtimeGateway.name);
  private readonly limiter = new SocketRateLimiter();

  constructor(
    private readonly authService: AuthService,
    private readonly widgetAuthService: WidgetAuthService,
    private readonly conversationsService: ConversationsService,
    private readonly workspaceMembersService: WorkspaceMembersService,
    private readonly messagesService: MessagesService,
    private readonly connectionRegistry: ConnectionRegistryService,
    private readonly realtimeEmitter: RealtimeEmitterService,
  ) {}

  /**
   * Handshake auth runs as Socket.IO middleware, not in handleConnection:
   * middleware completes BEFORE the connection is admitted, so no event
   * handler can ever observe a socket whose principal isn't set yet.
   * (handleConnection is async — authenticating there races against a
   * client that emits immediately after `connect`.) Rejected sockets get
   * a connect_error instead of connect-then-disconnect.
   *
   * Agents: `io(url, { auth: { token } })` with the JWT access token.
   * Widget visitors: `auth: { visitorToken }`.
   */
  afterInit(server: Server): void {
    // Business modules broadcast through the emitter, never the gateway.
    this.realtimeEmitter.setServer(server);
    server.use((socket: GatewaySocket, next) => {
      void this.authenticate(socket).then((error) => next(error));
    });
  }

  private async authenticate(client: GatewaySocket): Promise<Error | undefined> {
    const auth = client.handshake.auth as {
      token?: unknown;
      visitorToken?: unknown;
    };

    if (typeof auth.visitorToken === 'string') {
      const visitor = await this.widgetAuthService.verifyVisitorToken(
        auth.visitorToken,
      );
      if (!visitor) {
        this.logger.warn(`socket ${client.id} rejected: invalid visitor token`);
        return new Error('Unauthorized');
      }
      client.data.visitor = visitor;
      return undefined;
    }

    const user =
      typeof auth.token === 'string'
        ? await this.authService.verifyAccessToken(auth.token)
        : null;
    if (!user) {
      this.logger.warn(`socket ${client.id} rejected: invalid token`);
      return new Error('Unauthorized');
    }
    client.data.user = user;
    return undefined;
  }

  /**
   * Server-initiated fan-out for messages that arrive outside a socket
   * (inbound email webhook, outbound email REST send). Same event and
   * payload the socket path emits — dashboards can't tell the difference.
   */
  broadcastMessageCreated(
    message: MessageResponseDto,
    workspaceId?: string,
  ): void {
    let target = this.server.to(conversationRoom(message.conversationId));
    if (workspaceId) target = target.to(workspaceRoom(workspaceId));
    target.emit(SERVER_EVENTS.messageCreated, message);
  }

  /** Runs only for sockets the auth middleware admitted. */
  handleConnection(client: GatewaySocket): void {
    const { user, visitor } = client.data;
    if (user) {
      this.connectionRegistry.add(user.id, client.id);
      this.logger.log(`socket ${client.id} connected (user ${user.id})`);
    } else if (visitor) {
      this.logger.log(
        `socket ${client.id} connected (visitor contact ${visitor.contactId})`,
      );
    }
  }

  /** Socket.IO removes the socket from all rooms itself on disconnect. */
  handleDisconnect(client: GatewaySocket): void {
    const { user, visitor } = client.data;
    if (user) {
      this.connectionRegistry.remove(user.id, client.id);
      this.logger.log(`socket ${client.id} disconnected (user ${user.id})`);
    } else if (visitor) {
      this.logger.log(
        `socket ${client.id} disconnected (visitor contact ${visitor.contactId})`,
      );
    }
  }

  /**
   * Dashboard-wide subscription: everything happening in the workspace.
   * Agents only (visitors are pinned to their single conversation), with
   * membership re-checked against the database. Joining a workspace
   * leaves any previously joined one — a dashboard shows one tenant at a
   * time, and stale rooms would leak cross-workspace events into it.
   */
  @SubscribeMessage(CLIENT_EVENTS.joinWorkspace)
  async joinWorkspace(
    @ConnectedSocket() client: GatewaySocket,
    @MessageBody() payload: WorkspaceRoomDto,
  ): Promise<void> {
    this.throttle(client, CLIENT_EVENTS.joinWorkspace, 20, 10_000);
    const user = client.data.user;
    if (!user) {
      throw new WsException('Unauthorized');
    }
    const membership = await this.workspaceMembersService.findMembership(
      payload.workspaceId,
      user.id,
    );
    if (!membership) {
      throw new WsException('You are not a member of this workspace');
    }
    for (const room of client.rooms) {
      if (room.startsWith('workspace:') && room !== workspaceRoom(payload.workspaceId)) {
        await client.leave(room);
      }
    }
    await client.join(workspaceRoom(payload.workspaceId));
    client.emit(SERVER_EVENTS.workspaceJoined, {
      workspaceId: payload.workspaceId,
    });
  }

  @SubscribeMessage(CLIENT_EVENTS.joinConversation)
  async joinConversation(
    @ConnectedSocket() client: GatewaySocket,
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
    @ConnectedSocket() client: GatewaySocket,
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
    @ConnectedSocket() client: GatewaySocket,
    @MessageBody() payload: SendMessageWsDto,
  ): Promise<SendMessageAck> {
    try {
      this.throttle(client, CLIENT_EVENTS.sendMessage, 10, 10_000);
      const workspaceId = await this.authorizeConversation(
        client,
        payload.conversationId,
      );

      const message = client.data.visitor
        ? await this.messagesService.createContactMessage(
            client.data.visitor,
            {
              content: payload.content ?? '',
              attachmentIds: payload.attachmentIds,
            },
          )
        : await this.messagesService.createAgentMessage(
            // authorizeConversation guarantees one principal exists.
            client.data.user as AuthenticatedUser,
            workspaceId,
            payload.conversationId,
            {
              content: payload.content ?? '',
              attachmentIds: payload.attachmentIds,
            },
          );

      const room = conversationRoom(payload.conversationId);
      this.server
        .to(room)
        .to(workspaceRoom(workspaceId))
        .emit(SERVER_EVENTS.messageCreated, message);
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
    @ConnectedSocket() client: GatewaySocket,
    @MessageBody() payload: ConversationRoomDto,
  ): void {
    this.broadcastTyping(client, payload, SERVER_EVENTS.typingStarted);
  }

  @SubscribeMessage(CLIENT_EVENTS.typingStop)
  typingStop(
    @ConnectedSocket() client: GatewaySocket,
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
    client: GatewaySocket,
    payload: ConversationRoomDto,
    event: string,
  ): void {
    if (!this.limiter.allow(client, 'typing', 15, 5_000)) return;

    const room = conversationRoom(payload.conversationId);
    if (!client.rooms.has(room)) return;

    const sender = client.data.user
      ? { userId: client.data.user.id, name: client.data.user.name }
      : {
          userId: client.data.visitor?.contactId ?? '',
          name: client.data.visitor?.name ?? 'Visitor',
        };

    client.to(room).emit(event, {
      conversationId: payload.conversationId,
      ...sender,
    });
  }

  /**
   * Tenancy gate. Visitors are pinned to the single conversation embedded
   * in their token — no lookup, no way to reach another thread. Agents
   * are checked against the conversation's workspace membership in the
   * database. Returns the workspaceId for the follow-up service call.
   */
  private async authorizeConversation(
    client: GatewaySocket,
    conversationId: string,
  ): Promise<string> {
    const { user, visitor } = client.data;

    if (visitor) {
      if (conversationId !== visitor.conversationId) {
        throw new WsException(
          'You do not have access to this conversation',
        );
      }
      return visitor.workspaceId;
    }

    if (!user) {
      throw new WsException('Unauthorized');
    }

    const workspaceId =
      await this.conversationsService.getWorkspaceId(conversationId);
    if (!workspaceId) {
      throw new WsException('Conversation not found');
    }

    const membership = await this.workspaceMembersService.findMembership(
      workspaceId,
      user.id,
    );
    if (!membership) {
      throw new WsException('You do not have access to this conversation');
    }
    return workspaceId;
  }

  private throttle(
    client: GatewaySocket,
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
