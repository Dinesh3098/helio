import {
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { createReadStream } from 'node:fs';
import { unlink } from 'node:fs/promises';
import { EntityManager, Repository } from 'typeorm';
import { RequestContextService } from '../../common/request-context/request-context.service';
import {
  Attachment,
  Conversation,
  WorkspaceMemberRole,
} from '../../database/entities';
import { MetricsService } from '../../metrics/metrics.service';
import { AuditService } from '../audit/audit.service';
import { ObjectDownload } from '../storage/providers/storage-provider.interface';
import { StorageService } from '../storage/storage.service';
import { AttachmentResponseDto } from './dto/attachment.dto';

export interface UploadFileInput {
  workspaceId: string;
  /** Null for widget-visitor uploads (system upload). */
  uploadedByUserId: string | null;
  conversationId?: string;
  /** Multer temp file on disk — streamed to the provider, then removed. */
  tempPath: string;
  originalFilename: string;
  mimeType: string;
  size: number;
}

/**
 * Attachment lifecycle above the storage abstraction: tenancy checks,
 * metadata rows, linking to messages, audit, metrics. Knows nothing
 * about S3 or the filesystem — StorageService is the only door.
 */
@Injectable()
export class AttachmentsService {
  private readonly logger = new Logger(AttachmentsService.name);

  constructor(
    @InjectRepository(Attachment)
    private readonly attachmentsRepository: Repository<Attachment>,
    @InjectRepository(Conversation)
    private readonly conversationsRepository: Repository<Conversation>,
    private readonly storageService: StorageService,
    private readonly auditService: AuditService,
    private readonly metricsService: MetricsService,
    private readonly requestContext: RequestContextService,
  ) {}

  async upload(input: UploadFileInput): Promise<AttachmentResponseDto> {
    const startedAt = Date.now();

    if (input.conversationId) {
      const conversation = await this.conversationsRepository.findOne({
        where: { id: input.conversationId, workspaceId: input.workspaceId },
        select: { id: true },
      });
      if (!conversation) {
        throw new NotFoundException('Conversation not found');
      }
    }

    try {
      const stored = await this.storageService.store({
        workspaceId: input.workspaceId,
        body: createReadStream(input.tempPath),
        originalFilename: input.originalFilename,
        mimeType: input.mimeType,
        size: input.size,
      });

      const attachment = await this.attachmentsRepository.save(
        this.attachmentsRepository.create({
          workspaceId: input.workspaceId,
          conversationId: input.conversationId ?? null,
          uploadedByUserId: input.uploadedByUserId,
          provider: stored.provider,
          storageKey: stored.storageKey,
          filename: stored.filename,
          originalFilename: stored.originalFilename,
          mimeType: stored.mimeType,
          size: stored.size,
        }),
      );

      const context = this.requestContext.get();
      this.logger.log(
        `attachment uploaded requestId=${context?.requestId ?? '-'} workspaceId=${input.workspaceId} userId=${input.uploadedByUserId ?? 'system'} provider=${stored.provider} latencyMs=${Date.now() - startedAt} size=${stored.size} filename="${stored.filename}"`,
      );
      this.metricsService.recordAttachmentUpload(
        stored.provider,
        stored.size,
        (Date.now() - startedAt) / 1000,
      );
      this.auditService.record({
        workspaceId: input.workspaceId,
        actorUserId: input.uploadedByUserId,
        resourceType: 'attachment',
        resourceId: attachment.id,
        action: 'attachment.uploaded',
        metadata: {
          filename: stored.filename,
          size: stored.size,
          provider: stored.provider,
          ...(input.conversationId
            ? { conversationId: input.conversationId }
            : {}),
        },
      });

      return this.toResponse(attachment);
    } catch (error) {
      this.metricsService.recordAttachmentUploadFailure(
        this.storageService.providerName,
      );
      throw error;
    } finally {
      // The multer temp file is ours to clean up in every outcome.
      await unlink(input.tempPath).catch(() => undefined);
    }
  }

  async get(
    workspaceId: string,
    attachmentId: string,
  ): Promise<AttachmentResponseDto> {
    const attachment = await this.findInWorkspace(workspaceId, attachmentId);
    return this.toResponse(attachment);
  }

  async download(
    workspaceId: string,
    attachmentId: string,
  ): Promise<{ attachment: Attachment; download: ObjectDownload }> {
    const attachment = await this.findInWorkspace(workspaceId, attachmentId);
    const download = await this.storageService.getDownload(
      attachment.storageKey,
      attachment.filename,
    );
    return { attachment, download };
  }

  /**
   * Storage object first, then the row: a dangling row is recoverable, a
   * dangling object with no row is invisible garbage. Owner/admin may
   * delete anything; agents only what they uploaded.
   */
  async remove(
    workspaceId: string,
    attachmentId: string,
    actor: { userId: string; role: WorkspaceMemberRole },
  ): Promise<void> {
    const attachment = await this.findInWorkspace(workspaceId, attachmentId);

    if (
      actor.role === WorkspaceMemberRole.AGENT &&
      attachment.uploadedByUserId !== actor.userId
    ) {
      throw new ForbiddenException(
        'Agents can only delete files they uploaded',
      );
    }

    await this.storageService.delete(attachment.storageKey);
    await this.attachmentsRepository.remove(attachment);

    this.metricsService.recordAttachmentDeleted(attachment.provider);
    this.auditService.record({
      workspaceId,
      resourceType: 'attachment',
      resourceId: attachmentId,
      action: 'attachment.deleted',
      metadata: {
        filename: attachment.filename,
        size: Number(attachment.size),
        provider: attachment.provider,
      },
    });
  }

  /**
   * Links freshly uploaded attachments to a message and returns their
   * summaries for the message metadata. Only unlinked rows from the same
   * workspace/conversation qualify — an id from another tenant or an
   * already-sent message is treated as nonexistent.
   */
  async linkToMessage(
    workspaceId: string,
    conversationId: string,
    messageId: string,
    attachmentIds: string[],
    manager?: EntityManager,
  ): Promise<Attachment[]> {
    if (attachmentIds.length === 0) return [];
    const repository = manager
      ? manager.getRepository(Attachment)
      : this.attachmentsRepository;

    const attachments = await repository
      .createQueryBuilder('a')
      .where('a.id IN (:...ids)', { ids: attachmentIds })
      .andWhere('a.workspace_id = :workspaceId', { workspaceId })
      .andWhere('a.message_id IS NULL')
      .andWhere(
        '(a.conversation_id = :conversationId OR a.conversation_id IS NULL)',
        { conversationId },
      )
      .getMany();

    if (attachments.length !== attachmentIds.length) {
      throw new NotFoundException(
        'One or more attachments were not found or already sent',
      );
    }

    await repository.update(
      attachments.map((a) => a.id),
      { messageId, conversationId },
    );
    return attachments;
  }

  private async findInWorkspace(
    workspaceId: string,
    attachmentId: string,
  ): Promise<Attachment> {
    const attachment = await this.attachmentsRepository.findOne({
      where: { id: attachmentId, workspaceId },
    });
    if (!attachment) {
      throw new NotFoundException('Attachment not found');
    }
    return attachment;
  }

  private toResponse(attachment: Attachment): AttachmentResponseDto {
    return {
      id: attachment.id,
      conversationId: attachment.conversationId,
      messageId: attachment.messageId,
      filename: attachment.filename,
      mimeType: attachment.mimeType,
      size: Number(attachment.size),
      createdAt: attachment.createdAt,
    };
  }
}
