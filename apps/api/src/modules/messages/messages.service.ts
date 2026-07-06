import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, In, Repository } from 'typeorm';
import type { AuthenticatedUser } from '../../common/interfaces/authenticated-user.interface';
import {
  AutomationTrigger,
  Conversation,
  ConversationStatus,
  Message,
  MessageSenderType,
  MessageType,
  User,
  type MessageMetadata,
} from '../../database/entities';
import { ConversationEventsService } from '../../events/conversation-events.service';
import { AttachmentsService } from '../attachments/attachments.service';
import { CreateMessageDto } from './dto/create-message.dto';
import {
  MessageResponseDto,
  MessagesPageDto,
} from './dto/message-response.dto';
import { QueryMessagesDto } from './dto/query-messages.dto';

/** Keyset cursor: strictly-descending (created_at, id) position. */
interface MessageCursor {
  t: string;
  id: string;
}

const PREVIEW_LENGTH = 140;

@Injectable()
export class MessagesService {
  constructor(
    @InjectRepository(Message)
    private readonly messagesRepository: Repository<Message>,
    @InjectRepository(Conversation)
    private readonly conversationsRepository: Repository<Conversation>,
    @InjectRepository(User)
    private readonly usersRepository: Repository<User>,
    private readonly dataSource: DataSource,
    private readonly conversationEvents: ConversationEventsService,
    private readonly attachmentsService: AttachmentsService,
  ) {}

  /**
   * Newest page first (no cursor), each response ordered oldest→newest for
   * direct rendering. Keyset pagination on (created_at, id) walks toward
   * older messages and stays stable while new messages arrive — an offset
   * would shift and duplicate rows mid-scroll.
   */
  async listForConversation(
    workspaceId: string,
    conversationId: string,
    query: QueryMessagesDto,
  ): Promise<MessagesPageDto> {
    const conversation = await this.findInWorkspace(
      workspaceId,
      conversationId,
    );

    const qb = this.messagesRepository
      .createQueryBuilder('m')
      .where('m.conversation_id = :conversationId', { conversationId })
      .orderBy('m.created_at', 'DESC')
      .addOrderBy('m.id', 'DESC')
      // One extra row answers "is there an older page?" without a COUNT.
      .limit(query.limit + 1);

    if (query.cursor) {
      const cursor = this.decodeCursor(query.cursor);
      qb.andWhere('(m.created_at, m.id) < (:cursorTs, :cursorId)', {
        cursorTs: cursor.t,
        cursorId: cursor.id,
      });
    }

    const rows = await qb.getMany();
    const hasOlder = rows.length > query.limit;
    const page = rows.slice(0, query.limit);
    const oldest = page.at(-1);
    const nextCursor = hasOlder && oldest ? this.encodeCursor(oldest) : null;
    page.reverse();

    const userNames = await this.loadUserNames(page);
    return {
      data: page.map((message) =>
        this.toResponse(message, this.senderName(message, conversation, userNames)),
      ),
      nextCursor,
    };
  }

  async createAgentMessage(
    user: AuthenticatedUser,
    workspaceId: string,
    conversationId: string,
    dto: CreateMessageDto,
    metadata?: MessageMetadata,
  ): Promise<MessageResponseDto> {
    const conversation = await this.findInWorkspace(
      workspaceId,
      conversationId,
    );
    const message = await this.append(conversation, {
      senderType: MessageSenderType.USER,
      senderId: user.id,
      content: dto.content ?? '',
      metadata: metadata ?? null,
      attachmentIds: dto.attachmentIds,
    });
    const response = this.toResponse(message, user.name);
    this.conversationEvents.emit({
      trigger: AutomationTrigger.MESSAGE_SENT,
      workspaceId,
      conversationId,
      message: response,
    });
    return response;
  }

  /**
   * Automation-originated reply (senderId null — no human author). Runs
   * inside the executor's suppression scope, so it cannot re-trigger
   * rules; the caller broadcasts it to the room.
   */
  async createAutomationMessage(
    workspaceId: string,
    conversationId: string,
    content: string,
  ): Promise<MessageResponseDto> {
    const conversation = await this.findInWorkspace(
      workspaceId,
      conversationId,
    );
    const message = await this.append(conversation, {
      senderType: MessageSenderType.USER,
      senderId: null,
      content,
    });
    return this.toResponse(message, 'Automation');
  }

  /**
   * Widget path. The conversation is pinned server-side (it comes from
   * the visitor token, never from client input) and must belong to the
   * visitor's own contact — one visitor can never write into another's
   * thread even with a forged conversation id.
   */
  async createContactMessage(
    visitor: { contactId: string; workspaceId: string; conversationId: string },
    dto: CreateMessageDto,
    metadata?: MessageMetadata,
  ): Promise<MessageResponseDto> {
    const conversation = await this.findInWorkspace(
      visitor.workspaceId,
      visitor.conversationId,
    );
    if (conversation.contactId !== visitor.contactId) {
      throw new ForbiddenException(
        'This conversation belongs to another visitor',
      );
    }
    const message = await this.append(conversation, {
      senderType: MessageSenderType.CONTACT,
      senderId: visitor.contactId,
      content: dto.content ?? '',
      metadata: metadata ?? null,
      attachmentIds: dto.attachmentIds,
    });
    const response = this.toResponse(message, conversation.contact.name);
    this.conversationEvents.emit({
      trigger: AutomationTrigger.MESSAGE_RECEIVED,
      workspaceId: visitor.workspaceId,
      conversationId: conversation.id,
      message: response,
    });
    return response;
  }

  /**
   * Channel-agnostic core shared by agent (dashboard) and contact
   * (widget) writes. The message insert and the conversation's
   * denormalized last-message fields commit atomically — a half-applied
   * pair would corrupt the inbox ordering.
   */
  private async append(
    conversation: Conversation,
    input: {
      senderType: MessageSenderType;
      senderId: string | null;
      content: string;
      metadata?: MessageMetadata | null;
      attachmentIds?: string[];
    },
  ): Promise<Message> {
    if (conversation.status === ConversationStatus.RESOLVED) {
      throw new ConflictException(
        'Resolved conversations cannot receive new messages. Reopen the conversation first.',
      );
    }
    // Text OR files — a message must carry at least one of them.
    if (!input.content && !input.attachmentIds?.length) {
      throw new BadRequestException('Message needs text or an attachment');
    }

    return this.dataSource.transaction(async (manager) => {
      const message = await manager.getRepository(Message).save(
        manager.getRepository(Message).create({
          conversationId: conversation.id,
          senderType: input.senderType,
          senderId: input.senderId,
          content: input.content,
          messageType: MessageType.TEXT,
          metadata: input.metadata ?? null,
        }),
      );

      // Attachments link atomically with the message: a failed link
      // (foreign id, already sent) rolls the whole send back.
      let linkedFilenames: string[] = [];
      if (input.attachmentIds?.length) {
        const attachments = await this.attachmentsService.linkToMessage(
          conversation.workspaceId,
          conversation.id,
          message.id,
          input.attachmentIds,
          manager,
        );
        linkedFilenames = attachments.map((a) => a.filename);
        message.metadata = {
          ...(message.metadata ?? {}),
          attachments: attachments.map((attachment) => ({
            id: attachment.id,
            filename: attachment.filename,
            mimeType: attachment.mimeType,
            size: Number(attachment.size),
            url: null,
          })),
        };
        await manager
          .getRepository(Message)
          .update(message.id, { metadata: message.metadata });
      }

      // Activity in a snoozed conversation pulls it back into the inbox.
      const preview = input.content
        ? this.toPreview(input.content)
        : `📎 ${linkedFilenames[0] ?? 'Attachment'}${linkedFilenames.length > 1 ? ` +${linkedFilenames.length - 1}` : ''}`;
      await manager.getRepository(Conversation).update(conversation.id, {
        lastMessagePreview: preview,
        lastMessageAt: message.createdAt,
        ...(conversation.status === ConversationStatus.SNOOZED
          ? { status: ConversationStatus.OPEN }
          : {}),
      });

      return message;
    });
  }

  private async findInWorkspace(
    workspaceId: string,
    conversationId: string,
  ): Promise<Conversation> {
    const conversation = await this.conversationsRepository.findOne({
      where: { id: conversationId, workspaceId },
      relations: { contact: true },
    });
    if (!conversation) {
      throw new NotFoundException('Conversation not found');
    }
    return conversation;
  }

  /** One IN query resolves every agent name on the page — never per row. */
  private async loadUserNames(
    messages: Message[],
  ): Promise<Map<string, string>> {
    const userIds = [
      ...new Set(
        messages
          .filter((m) => m.senderType === MessageSenderType.USER && m.senderId)
          .map((m) => m.senderId as string),
      ),
    ];
    if (userIds.length === 0) return new Map();

    const users = await this.usersRepository.find({
      where: { id: In(userIds) },
      select: { id: true, name: true },
    });
    return new Map(users.map((user) => [user.id, user.name]));
  }

  private senderName(
    message: Message,
    conversation: Conversation,
    userNames: Map<string, string>,
  ): string | null {
    if (message.senderType === MessageSenderType.CONTACT) {
      return conversation.contact.name;
    }
    if (!message.senderId) return null;
    return userNames.get(message.senderId) ?? 'Former teammate';
  }

  private toResponse(
    message: Message,
    senderName: string | null,
  ): MessageResponseDto {
    return {
      id: message.id,
      conversationId: message.conversationId,
      senderType: message.senderType,
      senderId: message.senderId,
      senderName,
      content: message.content,
      messageType: message.messageType,
      metadata: message.metadata,
      createdAt: message.createdAt,
    };
  }

  private toPreview(content: string): string {
    return content.replace(/\s+/g, ' ').trim().slice(0, PREVIEW_LENGTH);
  }

  private encodeCursor(message: Message): string {
    const cursor: MessageCursor = {
      t: message.createdAt.toISOString(),
      id: message.id,
    };
    return Buffer.from(JSON.stringify(cursor)).toString('base64url');
  }

  private decodeCursor(raw: string): MessageCursor {
    try {
      const parsed = JSON.parse(
        Buffer.from(raw, 'base64url').toString('utf8'),
      ) as MessageCursor;
      if (typeof parsed.t !== 'string' || typeof parsed.id !== 'string') {
        throw new Error('malformed');
      }
      return parsed;
    } catch {
      throw new BadRequestException('Invalid pagination cursor');
    }
  }
}
