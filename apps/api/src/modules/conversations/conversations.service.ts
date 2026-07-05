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
import { WorkspaceMembersService } from '../workspace-members/workspace-members.service';
import { AssignConversationDto } from './dto/assign-conversation.dto';
import {
  ConversationDetailResponseDto,
  ConversationResponseDto,
  PaginatedConversationsDto,
} from './dto/conversation-response.dto';
import { QueryConversationsDto } from './dto/query-conversations.dto';

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

  async setStatus(
    workspaceId: string,
    conversationId: string,
    status: ConversationStatus,
  ): Promise<ConversationResponseDto> {
    const conversation = await this.findWithContact(
      workspaceId,
      conversationId,
    );
    if (conversation.status !== status) {
      conversation.status = status;
      await this.conversationsRepository.save(conversation);
    }
    return this.toResponse(conversation);
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

    const conversation = await this.findWithContact(
      actor.workspaceId,
      conversationId,
    );

    await this.dataSource.transaction(async (manager) => {
      await manager.getRepository(ConversationAssignment).save(
        manager.getRepository(ConversationAssignment).create({
          conversationId: conversation.id,
          assignedToUserId: member.userId,
          assignedByUserId: actor.userId,
        }),
      );
      conversation.assignedToUserId = member.userId;
      conversation.assignedAt = new Date();
      await manager.getRepository(Conversation).save(conversation);
    });

    return this.toResponse(conversation);
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
