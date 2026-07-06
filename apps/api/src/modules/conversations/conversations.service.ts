import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository, SelectQueryBuilder } from 'typeorm';
import {
  Conversation,
  ConversationAssignment,
  ConversationStatus,
  ConversationSummary,
  Message,
  WorkspaceMember,
  WorkspaceMemberRole,
} from '../../database/entities';
import { RealtimeEmitterService } from '../../realtime/realtime-emitter.service';
import { SERVER_EVENTS } from '../../realtime/realtime.events';
import { WorkspaceMembersService } from '../workspace-members/workspace-members.service';
import { AssignConversationDto } from './dto/assign-conversation.dto';
import {
  ConversationAssigneeDto,
  ConversationDetailResponseDto,
  ConversationResponseDto,
  PaginatedConversationsDto,
} from './dto/conversation-response.dto';
import { QueryConversationsDto } from './dto/query-conversations.dto';
import { UpdateConversationDto } from './dto/update-conversation.dto';

/** Broadcast shape: the list row plus the resolved assignee for details. */
export type ConversationUpdatedPayload = ConversationResponseDto & {
  assignee: ConversationAssigneeDto | null;
};

@Injectable()
export class ConversationsService {
  constructor(
    @InjectRepository(Conversation)
    private readonly conversationsRepository: Repository<Conversation>,
    @InjectRepository(ConversationSummary)
    private readonly summariesRepository: Repository<ConversationSummary>,
    @InjectRepository(Message)
    private readonly messagesRepository: Repository<Message>,
    private readonly workspaceMembersService: WorkspaceMembersService,
    private readonly dataSource: DataSource,
    private readonly realtimeEmitter: RealtimeEmitterService,
  ) {}

  async list(
    workspaceId: string,
    query: QueryConversationsDto,
  ): Promise<PaginatedConversationsDto> {
    const qb = this.baseQuery(workspaceId);

    if (query.status) {
      qb.andWhere('c.status = :status', { status: query.status });
    }
    if (query.channel) {
      qb.andWhere('c.channel = :channel', { channel: query.channel });
    }
    if (query.assignedToUserId) {
      qb.andWhere('c.assigned_to_user_id = :assignee', {
        assignee: query.assignedToUserId,
      });
    }
    if (query.contactId) {
      qb.andWhere('c.contact_id = :contactId', {
        contactId: query.contactId,
      });
    }
    if (query.search) {
      qb.andWhere('contact.name ILIKE :search', {
        search: `%${query.search}%`,
      });
    }

    const sortExpression =
      query.sortBy === 'createdAt'
        ? 'c.created_at'
        : 'COALESCE(c.last_message_at, c.created_at)';
    // offset/limit (not skip/take): skip/take's join-pagination subquery
    // cannot parse raw orderBy expressions, and the contact join is
    // many-to-one so raw pagination cannot multiply rows.
    qb.orderBy(sortExpression, query.sortOrder)
      .offset(query.skip)
      .limit(query.limit);

    const [conversations, total] = await qb.getManyAndCount();
    return {
      data: conversations.map((c) => this.toResponse(c)),
      total,
      page: query.page,
      limit: query.limit,
    };
  }

  async getDetail(
    workspaceId: string,
    conversationId: string,
  ): Promise<ConversationDetailResponseDto> {
    const conversation = await this.conversationsRepository.findOne({
      where: { id: conversationId, workspaceId },
      relations: { contact: true, assignedToUser: true },
    });
    if (!conversation) {
      throw new NotFoundException('Conversation not found');
    }

    const [summary, messagesCount] = await Promise.all([
      this.summariesRepository.findOne({ where: { conversationId } }),
      this.messagesRepository.count({ where: { conversationId } }),
    ]);

    return {
      ...this.toResponse(conversation),
      contact: {
        id: conversation.contact.id,
        name: conversation.contact.name,
        email: conversation.contact.email,
        phone: conversation.contact.phone,
        createdAt: conversation.contact.createdAt,
        updatedAt: conversation.contact.updatedAt,
      },
      assignee: conversation.assignedToUser
        ? {
            userId: conversation.assignedToUser.id,
            name: conversation.assignedToUser.name,
            email: conversation.assignedToUser.email,
          }
        : null,
      aiSummary: summary
        ? {
            summary: summary.summary,
            model: summary.model,
            updatedAt: summary.updatedAt,
          }
        : null,
      messagesCount,
    };
  }

  /** Status and/or priority in one PATCH; broadcasts on actual change. */
  async update(
    workspaceId: string,
    conversationId: string,
    dto: UpdateConversationDto,
  ): Promise<ConversationResponseDto> {
    const conversation = await this.findWithContact(
      workspaceId,
      conversationId,
    );

    let changed = false;
    if (dto.status !== undefined && dto.status !== conversation.status) {
      conversation.status = dto.status;
      changed = true;
    }
    if (dto.priority !== undefined && dto.priority !== conversation.priority) {
      conversation.priority = dto.priority;
      changed = true;
    }
    if (changed) {
      await this.conversationsRepository.save(conversation);
      await this.broadcastUpdated(workspaceId, conversationId);
    }
    return this.toResponse(conversation);
  }

  async setStatus(
    workspaceId: string,
    conversationId: string,
    status: ConversationStatus,
  ): Promise<ConversationResponseDto> {
    return this.update(workspaceId, conversationId, { status });
  }

  /**
   * Assignment history and the denormalized current assignee move together
   * atomically. Agents may only take conversations themselves; owners and
   * admins may hand them to anyone in the workspace.
   */
  async assign(
    actor: WorkspaceMember,
    conversationId: string,
    dto: AssignConversationDto,
  ): Promise<ConversationResponseDto> {
    const conversation = await this.findWithContact(
      actor.workspaceId,
      conversationId,
    );

    let targetUserId: string | null = null;
    if (dto.workspaceMemberId) {
      const member = await this.workspaceMembersService.findByIdInWorkspace(
        actor.workspaceId,
        dto.workspaceMemberId,
      );
      if (!member) {
        throw new NotFoundException('Member not found in this workspace');
      }
      if (
        actor.role === WorkspaceMemberRole.AGENT &&
        member.userId !== actor.userId
      ) {
        throw new ForbiddenException(
          'Agents can only assign conversations to themselves',
        );
      }
      targetUserId = member.userId;
    } else if (
      // Unassign: agents may only release conversations they hold.
      actor.role === WorkspaceMemberRole.AGENT &&
      conversation.assignedToUserId !== actor.userId
    ) {
      throw new ForbiddenException(
        'Agents can only unassign conversations assigned to themselves',
      );
    }

    if (conversation.assignedToUserId !== targetUserId) {
      await this.dataSource.transaction(async (manager) => {
        // History rows record unassignments too (assignedToUserId null).
        await manager.getRepository(ConversationAssignment).save(
          manager.getRepository(ConversationAssignment).create({
            conversationId: conversation.id,
            assignedToUserId: targetUserId,
            assignedByUserId: actor.userId,
          }),
        );
        conversation.assignedToUserId = targetUserId;
        conversation.assignedAt = targetUserId ? new Date() : null;
        await manager.getRepository(Conversation).save(conversation);
      });
      await this.broadcastUpdated(actor.workspaceId, conversationId);
    }

    return this.toResponse(conversation);
  }

  /**
   * Fans the fresh conversation (with resolved assignee) into its room so
   * every dashboard viewing it updates without a refetch. Reloads once —
   * management actions are rare enough that one extra query beats
   * threading partial state through every call site.
   */
  private async broadcastUpdated(
    workspaceId: string,
    conversationId: string,
  ): Promise<void> {
    const conversation = await this.conversationsRepository.findOne({
      where: { id: conversationId, workspaceId },
      relations: { contact: true, assignedToUser: true },
    });
    if (!conversation) return;

    const payload: ConversationUpdatedPayload = {
      ...this.toResponse(conversation),
      assignee: conversation.assignedToUser
        ? {
            userId: conversation.assignedToUser.id,
            name: conversation.assignedToUser.name,
            email: conversation.assignedToUser.email,
          }
        : null,
    };
    this.realtimeEmitter.emitToConversation(
      conversationId,
      SERVER_EVENTS.conversationUpdated,
      payload,
    );
  }

  async listForContact(
    workspaceId: string,
    contactId: string,
    query: QueryConversationsDto,
  ): Promise<PaginatedConversationsDto> {
    // Object.assign keeps the DTO prototype (a spread would drop the
    // `skip` getter).
    const scoped = Object.assign(new QueryConversationsDto(), query, {
      contactId,
    });
    return this.list(workspaceId, scoped);
  }

  /**
   * Lean tenancy lookup for the realtime gateway: which workspace owns
   * this conversation? No relations, two columns.
   */
  async getWorkspaceId(conversationId: string): Promise<string | null> {
    const conversation = await this.conversationsRepository.findOne({
      where: { id: conversationId },
      select: { id: true, workspaceId: true },
    });
    return conversation?.workspaceId ?? null;
  }

  private baseQuery(workspaceId: string): SelectQueryBuilder<Conversation> {
    return this.conversationsRepository
      .createQueryBuilder('c')
      .leftJoinAndSelect('c.contact', 'contact')
      .where('c.workspace_id = :workspaceId', { workspaceId });
  }

  private async findWithContact(
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

  private toResponse(conversation: Conversation): ConversationResponseDto {
    return {
      id: conversation.id,
      contactId: conversation.contactId,
      contactName: conversation.contact.name,
      channel: conversation.channel,
      status: conversation.status,
      priority: conversation.priority,
      subject: conversation.subject,
      assignedToUserId: conversation.assignedToUserId,
      lastMessagePreview: conversation.lastMessagePreview,
      lastMessageAt: conversation.lastMessageAt,
      createdAt: conversation.createdAt,
      updatedAt: conversation.updatedAt,
    };
  }
}
