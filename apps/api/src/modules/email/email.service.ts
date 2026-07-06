import {
  BadRequestException,
  ConflictException,
  GatewayTimeoutException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { randomUUID } from 'node:crypto';
import { Brackets, In, Repository } from 'typeorm';
import type { AuthenticatedUser } from '../../common/interfaces/authenticated-user.interface';
import {
  AutomationTrigger,
  Contact,
  Conversation,
  ConversationChannel,
  ConversationStatus,
  EmailAccount,
  EmailThread,
  type MessageMetadata,
} from '../../database/entities';
import { ConversationEventsService } from '../../events/conversation-events.service';
import { MetricsService } from '../../metrics/metrics.service';
import { AuditService } from '../audit/audit.service';
import { RealtimeGateway } from '../../realtime/realtime.gateway';
import { MessageResponseDto } from '../messages/dto/message-response.dto';
import { MessagesService } from '../messages/messages.service';
import {
  CreateEmailAccountDto,
  EmailAccountResponseDto,
  UpdateEmailAccountDto,
} from './dto/email-account.dto';
import {
  InboundEmailDto,
  InboundEmailResultDto,
} from './dto/inbound-email.dto';
import {
  EMAIL_PROVIDER,
  EmailProviderError,
  type EmailProvider,
} from './providers/provider.interface';

const HELIO_MESSAGE_ID_DOMAIN = 'helio.mail';

@Injectable()
export class EmailService {
  private readonly logger = new Logger(EmailService.name);

  constructor(
    @Inject(EMAIL_PROVIDER) private readonly provider: EmailProvider,
    @InjectRepository(EmailAccount)
    private readonly accountsRepository: Repository<EmailAccount>,
    @InjectRepository(EmailThread)
    private readonly threadsRepository: Repository<EmailThread>,
    @InjectRepository(Contact)
    private readonly contactsRepository: Repository<Contact>,
    @InjectRepository(Conversation)
    private readonly conversationsRepository: Repository<Conversation>,
    private readonly messagesService: MessagesService,
    private readonly realtimeGateway: RealtimeGateway,
    private readonly conversationEvents: ConversationEventsService,
    private readonly auditService: AuditService,
    private readonly metricsService: MetricsService,
  ) {}

  // ---------- Accounts (owner/admin) ----------

  async listAccounts(workspaceId: string): Promise<EmailAccountResponseDto[]> {
    const accounts = await this.accountsRepository.find({
      where: { workspaceId },
      order: { createdAt: 'ASC' },
    });
    return accounts.map((account) => this.toAccountResponse(account));
  }

  async createAccount(
    workspaceId: string,
    dto: CreateEmailAccountDto,
  ): Promise<EmailAccountResponseDto> {
    const email = dto.email.toLowerCase();
    // The column is globally unique — one mailbox feeds one workspace.
    const existing = await this.accountsRepository.findOne({
      where: { email },
    });
    if (existing) {
      throw new ConflictException(
        'This email address is already connected to a workspace',
      );
    }

    const account = await this.accountsRepository.save(
      this.accountsRepository.create({
        workspaceId,
        email,
        displayName: dto.displayName ?? null,
        provider: this.provider.name,
      }),
    );
    this.auditService.record({
      workspaceId,
      resourceType: 'email_account',
      resourceId: account.id,
      action: 'email_account.created',
      metadata: { email: account.email },
    });
    return this.toAccountResponse(account);
  }

  async updateAccount(
    workspaceId: string,
    accountId: string,
    dto: UpdateEmailAccountDto,
  ): Promise<EmailAccountResponseDto> {
    const account = await this.findAccountInWorkspace(workspaceId, accountId);

    if (dto.email !== undefined) {
      const email = dto.email.toLowerCase();
      if (email !== account.email) {
        const duplicate = await this.accountsRepository.findOne({
          where: { email },
        });
        if (duplicate) {
          throw new ConflictException(
            'This email address is already connected to a workspace',
          );
        }
        account.email = email;
        // A new address needs its own verification.
        account.isVerified = false;
      }
    }
    if (dto.displayName !== undefined) account.displayName = dto.displayName;
    if (dto.isVerified !== undefined) account.isVerified = dto.isVerified;
    if (dto.status !== undefined) account.status = dto.status;

    await this.accountsRepository.save(account);
    this.auditService.record({
      workspaceId,
      resourceType: 'email_account',
      resourceId: account.id,
      action: 'email_account.updated',
      metadata: { email: account.email, fields: Object.keys(dto) },
    });
    return this.toAccountResponse(account);
  }

  async removeAccount(workspaceId: string, accountId: string): Promise<void> {
    const account = await this.findAccountInWorkspace(workspaceId, accountId);
    const removed = { id: accountId, email: account.email };
    await this.accountsRepository.remove(account);
    this.auditService.record({
      workspaceId,
      resourceType: 'email_account',
      resourceId: removed.id,
      action: 'email_account.deleted',
      metadata: { email: removed.email },
    });
  }

  // ---------- Outbound: agent reply ----------

  /**
   * Provider first, persistence second: a Message row must never claim an
   * email that was never handed to the provider. The rare inverse (sent
   * but DB write fails) is logged loudly for manual reconciliation.
   */
  async sendReply(
    user: AuthenticatedUser,
    workspaceId: string,
    conversationId: string,
    content: string,
  ): Promise<MessageResponseDto> {
    const conversation = await this.conversationsRepository.findOne({
      where: { id: conversationId, workspaceId },
      relations: { contact: true },
    });
    if (!conversation) {
      throw new NotFoundException('Conversation not found');
    }
    if (conversation.channel !== ConversationChannel.EMAIL) {
      throw new BadRequestException(
        'This is not an email conversation — reply in the chat composer',
      );
    }
    if (conversation.status === ConversationStatus.RESOLVED) {
      throw new ConflictException(
        'Resolved conversations cannot receive new messages. Reopen the conversation first.',
      );
    }
    if (!conversation.contact.email) {
      throw new UnprocessableEntityException(
        'This contact has no email address',
      );
    }

    const account = await this.accountsRepository.findOne({
      where: { workspaceId, status: 'ACTIVE' },
      order: { createdAt: 'ASC' },
    });
    if (!account) {
      throw new UnprocessableEntityException(
        'Connect an active email account before replying by email',
      );
    }

    const thread = await this.threadsRepository.findOne({
      where: { conversationId: conversation.id },
    });

    const outboundMessageId = `<${randomUUID()}@${HELIO_MESSAGE_ID_DOMAIN}>`;
    const subject = conversation.subject
      ? conversation.subject.startsWith('Re:')
        ? conversation.subject
        : `Re: ${conversation.subject}`
      : `Your conversation with ${account.displayName ?? account.email}`;

    const lastKnownId = thread
      ? (this.parseIdChain(thread.references).at(-1) ??
        thread.messageIdHeader)
      : undefined;

    try {
      await this.provider.send({
        from: account.email,
        fromName: account.displayName ?? undefined,
        to: conversation.contact.email,
        subject,
        text: content,
        headers: {
          'Message-ID': outboundMessageId,
          ...(lastKnownId ? { 'In-Reply-To': lastKnownId } : {}),
          ...(thread
            ? {
                References: [
                  ...this.parseIdChain(thread.references),
                  thread.messageIdHeader,
                ]
                  .filter((id, i, all) => all.indexOf(id) === i)
                  .join(' '),
              }
            : {}),
        },
      });
    } catch (error) {
      this.metricsService.recordEmailOutbound('error');
      throw this.mapProviderError(error);
    }
    this.metricsService.recordEmailOutbound('success');

    const metadata: MessageMetadata = {
      email: {
        subject,
        from: account.email,
        to: conversation.contact.email,
        messageId: outboundMessageId,
        html: null,
        attachments: [],
      },
    };

    try {
      // Same append core as chat: transaction, preview, snooze-reopen.
      const message = await this.messagesService.createAgentMessage(
        user,
        workspaceId,
        conversationId,
        { content },
        metadata,
      );

      if (thread) {
        await this.appendToThreadReferences(thread, outboundMessageId);
      } else {
        await this.threadsRepository.save(
          this.threadsRepository.create({
            conversationId: conversation.id,
            messageIdHeader: outboundMessageId,
            inReplyTo: null,
            references: null,
          }),
        );
      }

      this.realtimeGateway.broadcastMessageCreated(message);
      return message;
    } catch (error) {
      this.logger.error(
        `Email ${outboundMessageId} was sent but persisting the message failed — manual reconciliation needed for conversation ${conversationId}`,
      );
      throw error;
    }
  }

  // ---------- Inbound: webhook ----------

  async receiveInbound(dto: InboundEmailDto): Promise<InboundEmailResultDto> {
    // The receiving mailbox decides the workspace — never the sender.
    const account = await this.accountsRepository.findOne({
      where: { email: dto.to.toLowerCase() },
    });
    if (!account) {
      throw new NotFoundException(
        'No email account is connected for this address',
      );
    }
    if (account.status !== 'ACTIVE') {
      throw new UnprocessableEntityException(
        'This email account is disabled',
      );
    }
    const workspaceId = account.workspaceId;

    const contact = await this.findOrCreateContact(
      workspaceId,
      dto.from.toLowerCase(),
      dto.fromName,
    );

    let thread = await this.matchThread(workspaceId, dto);
    let threadReused = thread !== null;

    if (thread) {
      const conversation = await this.conversationsRepository.findOne({
        where: { id: thread.conversationId, workspaceId },
      });
      // A reply to a resolved thread starts fresh — same rule as the
      // chat widget, keeping RESOLVED terminal across channels.
      if (!conversation || conversation.status === ConversationStatus.RESOLVED) {
        thread = null;
        threadReused = false;
      }
    }

    if (!thread) {
      const conversation = await this.conversationsRepository.save(
        this.conversationsRepository.create({
          workspaceId,
          contactId: contact.id,
          channel: ConversationChannel.EMAIL,
          status: ConversationStatus.OPEN,
          subject: dto.subject?.trim() || null,
        }),
      );
      thread = await this.threadsRepository.save(
        this.threadsRepository.create({
          conversationId: conversation.id,
          messageIdHeader: dto.messageId,
          inReplyTo: dto.inReplyTo ?? null,
          references: dto.references ?? null,
        }),
      );
      this.conversationEvents.emit({
        trigger: AutomationTrigger.CONVERSATION_CREATED,
        workspaceId,
        conversationId: conversation.id,
      });
    } else {
      await this.appendToThreadReferences(thread, dto.messageId);
    }

    const metadata: MessageMetadata = {
      email: {
        subject: dto.subject?.trim() || null,
        from: dto.from.toLowerCase(),
        to: account.email,
        messageId: dto.messageId,
        html: dto.html ?? null,
        attachments: (dto.attachments ?? []).map((attachment) => ({
          filename: attachment.filename,
          mimeType: attachment.mimeType,
          size: attachment.size,
          url: attachment.url ?? null,
        })),
      },
    };

    const message = await this.messagesService.createContactMessage(
      {
        contactId: contact.id,
        workspaceId,
        conversationId: thread.conversationId,
      },
      { content: dto.text },
      metadata,
    );

    this.realtimeGateway.broadcastMessageCreated(message);
    this.metricsService.recordEmailInbound();

    return {
      conversationId: thread.conversationId,
      messageId: message.id,
      threadReused,
    };
  }

  // ---------- internals ----------

  /**
   * RFC 5322 matching: the inbound In-Reply-To/References ids are matched
   * against each thread's first message id (indexed) and its accumulated
   * reference chain. Workspace-scoped through the conversation join, so a
   * forged header can never cross tenants.
   */
  private async matchThread(
    workspaceId: string,
    dto: InboundEmailDto,
  ): Promise<EmailThread | null> {
    const candidates = [
      ...(dto.inReplyTo ? [dto.inReplyTo] : []),
      ...this.parseIdChain(dto.references),
    ].filter((id, i, all) => all.indexOf(id) === i);
    if (candidates.length === 0) return null;

    const byHeader = await this.threadsRepository.findOne({
      where: { messageIdHeader: In(candidates) },
      relations: { conversation: true },
    });
    if (byHeader && byHeader.conversation.workspaceId === workspaceId) {
      return byHeader;
    }

    const qb = this.threadsRepository
      .createQueryBuilder('t')
      .innerJoinAndSelect('t.conversation', 'c')
      .where('c.workspace_id = :workspaceId', { workspaceId })
      .andWhere(
        new Brackets((where) => {
          candidates.forEach((id, index) => {
            where.orWhere(`t.references LIKE :ref${index}`, {
              [`ref${index}`]: `%${id}%`,
            });
          });
        }),
      );
    return qb.getOne();
  }

  private async appendToThreadReferences(
    thread: EmailThread,
    messageId: string,
  ): Promise<void> {
    const chain = this.parseIdChain(thread.references);
    if (!chain.includes(messageId)) {
      chain.push(messageId);
      thread.references = chain.join(' ');
      await this.threadsRepository.save(thread);
    }
  }

  private parseIdChain(references: string | null | undefined): string[] {
    return (references ?? '').split(/\s+/).filter(Boolean);
  }

  private async findOrCreateContact(
    workspaceId: string,
    email: string,
    name?: string,
  ): Promise<Contact> {
    const existing = await this.contactsRepository.findOne({
      where: { workspaceId, email },
    });
    if (existing) return existing;

    return this.contactsRepository.save(
      this.contactsRepository.create({
        workspaceId,
        email,
        name: name?.trim() || email.split('@')[0] || email,
      }),
    );
  }

  private async findAccountInWorkspace(
    workspaceId: string,
    accountId: string,
  ): Promise<EmailAccount> {
    const account = await this.accountsRepository.findOne({
      where: { id: accountId, workspaceId },
    });
    if (!account) {
      throw new NotFoundException('Email account not found');
    }
    return account;
  }

  private mapProviderError(error: unknown): Error {
    if (error instanceof EmailProviderError) {
      switch (error.reason) {
        case 'timeout':
          return new GatewayTimeoutException(error.message);
        case 'rejected':
          return new UnprocessableEntityException(error.message);
        case 'unavailable':
          return new ServiceUnavailableException(error.message);
      }
    }
    return new ServiceUnavailableException('Email sending failed');
  }

  private toAccountResponse(account: EmailAccount): EmailAccountResponseDto {
    return {
      id: account.id,
      email: account.email,
      displayName: account.displayName,
      provider: account.provider,
      isVerified: account.isVerified,
      status: account.status,
      createdAt: account.createdAt,
      updatedAt: account.updatedAt,
    };
  }
}
