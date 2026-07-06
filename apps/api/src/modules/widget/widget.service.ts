import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, QueryFailedError, Repository } from 'typeorm';
import {
  AutomationTrigger,
  Contact,
  Conversation,
  ConversationChannel,
  ConversationStatus,
  Workspace,
} from '../../database/entities';
import { ConversationEventsService } from '../../events/conversation-events.service';
import { CreateWidgetSessionDto } from './dto/create-widget-session.dto';
import { WidgetSessionResponseDto } from './dto/widget-session-response.dto';
import { WidgetAuthService } from './widget-auth.service';

const PG_UNIQUE_VIOLATION = '23505';

/**
 * Visitor session bootstrap: workspace check → find-or-create the contact
 * behind the browser's stable visitorId → find-or-create an active CHAT
 * conversation → issue a visitor token pinned to that conversation.
 *
 * Re-running is idempotent and cheap, so the widget calls it on every
 * page load — and again after an agent resolves the thread, which is how
 * a follow-up message lands in a fresh conversation.
 */
@Injectable()
export class WidgetService {
  constructor(
    @InjectRepository(Workspace)
    private readonly workspacesRepository: Repository<Workspace>,
    @InjectRepository(Contact)
    private readonly contactsRepository: Repository<Contact>,
    @InjectRepository(Conversation)
    private readonly conversationsRepository: Repository<Conversation>,
    private readonly widgetAuthService: WidgetAuthService,
    private readonly conversationEvents: ConversationEventsService,
  ) {}

  async createSession(
    dto: CreateWidgetSessionDto,
  ): Promise<WidgetSessionResponseDto> {
    const workspace = await this.workspacesRepository.findOne({
      where: { id: dto.workspaceId },
    });
    if (!workspace) {
      throw new NotFoundException('Workspace not found');
    }

    const contact = await this.findOrCreateContact(
      dto.workspaceId,
      dto.visitorId,
    );
    const conversation = await this.findOrCreateConversation(contact);

    const visitorToken = await this.widgetAuthService.signVisitorToken({
      contactId: contact.id,
      workspaceId: contact.workspaceId,
      conversationId: conversation.id,
      name: contact.name,
    });

    return {
      visitorToken,
      contact: { id: contact.id, name: contact.name },
      conversation: { id: conversation.id, status: conversation.status },
      workspace: { name: workspace.name },
    };
  }

  private async findOrCreateContact(
    workspaceId: string,
    visitorId: string,
  ): Promise<Contact> {
    const existing = await this.contactsRepository.findOne({
      where: { workspaceId, visitorId },
    });
    if (existing) return existing;

    try {
      return await this.contactsRepository.save(
        this.contactsRepository.create({
          workspaceId,
          visitorId,
          // Distinguishable in the inbox until the visitor identifies
          // themselves (a later milestone).
          name: `Visitor ${visitorId.slice(0, 8)}`,
        }),
      );
    } catch (error) {
      // Two tabs bootstrapping simultaneously: the unique
      // (workspace_id, visitor_id) index makes one insert lose — reuse
      // the winner's row.
      if (this.isUniqueViolation(error)) {
        const contact = await this.contactsRepository.findOne({
          where: { workspaceId, visitorId },
        });
        if (contact) return contact;
      }
      throw error;
    }
  }

  /**
   * Latest still-active chat thread wins; a RESOLVED history never
   * reopens from the widget side — the next message starts fresh.
   */
  private async findOrCreateConversation(
    contact: Contact,
  ): Promise<Conversation> {
    const active = await this.conversationsRepository.findOne({
      where: {
        workspaceId: contact.workspaceId,
        contactId: contact.id,
        channel: ConversationChannel.CHAT,
        status: In([ConversationStatus.OPEN, ConversationStatus.SNOOZED]),
      },
      order: { createdAt: 'DESC' },
    });
    if (active) return active;

    const conversation = await this.conversationsRepository.save(
      this.conversationsRepository.create({
        workspaceId: contact.workspaceId,
        contactId: contact.id,
        channel: ConversationChannel.CHAT,
        status: ConversationStatus.OPEN,
      }),
    );
    this.conversationEvents.emit({
      trigger: AutomationTrigger.CONVERSATION_CREATED,
      workspaceId: contact.workspaceId,
      conversationId: conversation.id,
    });
    return conversation;
  }

  private isUniqueViolation(error: unknown): boolean {
    return (
      error instanceof QueryFailedError &&
      (error.driverError as { code?: string }).code === PG_UNIQUE_VIOLATION
    );
  }
}
