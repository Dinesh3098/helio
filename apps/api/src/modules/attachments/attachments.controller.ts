import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  Res,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import {
  ApiBearerAuth,
  ApiBody,
  ApiConsumes,
  ApiCreatedResponse,
  ApiHeader,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import type { Response } from 'express';
import { tmpdir } from 'node:os';
import { CurrentMembership } from '../../common/decorators/current-membership.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { RolesGuard } from '../../common/guards/roles.guard';
import { WorkspaceMember, WorkspaceMemberRole } from '../../database/entities';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { AttachmentsService } from './attachments.service';
import {
  AttachmentResponseDto,
  UploadAttachmentDto,
} from './dto/attachment.dto';

const ALL_ROLES = [
  WorkspaceMemberRole.OWNER,
  WorkspaceMemberRole.ADMIN,
  WorkspaceMemberRole.AGENT,
] as const;

/**
 * Multer writes the incoming part to a temp file on disk (its default
 * disk storage — no full-file memory buffering); the service streams it
 * to the storage provider and unlinks it. A generous multer-level cap
 * exists only as a transport guard; the real configurable limit is
 * enforced in StorageService.validate.
 */
const MULTER_HARD_LIMIT_BYTES = 100 * 1024 * 1024;

@ApiTags('attachments')
@ApiBearerAuth()
@ApiHeader({
  name: 'x-workspace-id',
  required: false,
  description:
    'Workspace to operate on. Optional when the user belongs to exactly one workspace.',
})
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('attachments')
export class AttachmentsController {
  constructor(private readonly attachmentsService: AttachmentsService) {}

  @Post()
  @Roles(...ALL_ROLES)
  @UseInterceptors(
    FileInterceptor('file', {
      // dest forces disk storage: the part streams to a temp file, never
      // into memory (multer's no-dest default is a memory buffer).
      dest: tmpdir(),
      limits: { fileSize: MULTER_HARD_LIMIT_BYTES, files: 1 },
    }),
  )
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      required: ['file'],
      properties: {
        file: { type: 'string', format: 'binary' },
        conversationId: { type: 'string', format: 'uuid' },
      },
    },
  })
  @ApiOperation({ summary: 'Upload a file (streamed to storage)' })
  @ApiCreatedResponse({ type: AttachmentResponseDto })
  upload(
    @CurrentMembership() membership: WorkspaceMember,
    @UploadedFile() file: Express.Multer.File | undefined,
    @Body() dto: UploadAttachmentDto,
  ): Promise<AttachmentResponseDto> {
    if (!file) {
      throw new BadRequestException('Send the file as multipart field "file"');
    }
    return this.attachmentsService.upload({
      workspaceId: membership.workspaceId,
      uploadedByUserId: membership.userId,
      conversationId: dto.conversationId,
      tempPath: file.path,
      originalFilename: file.originalname,
      mimeType: file.mimetype,
      size: file.size,
    });
  }

  @Get(':id')
  @Roles(...ALL_ROLES)
  @ApiOperation({ summary: 'Attachment metadata' })
  @ApiOkResponse({ type: AttachmentResponseDto })
  get(
    @CurrentMembership() membership: WorkspaceMember,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<AttachmentResponseDto> {
    return this.attachmentsService.get(membership.workspaceId, id);
  }

  @Get(':id/download')
  @Roles(...ALL_ROLES)
  @ApiOperation({
    summary:
      'Download: redirects to a signed URL (S3) or streams the file (local)',
  })
  async download(
    @CurrentMembership() membership: WorkspaceMember,
    @Param('id', ParseUUIDPipe) id: string,
    @Res() response: Response,
  ): Promise<void> {
    const { attachment, download } = await this.attachmentsService.download(
      membership.workspaceId,
      id,
    );
    if (download.kind === 'url') {
      response.redirect(HttpStatus.FOUND, download.url);
      return;
    }
    response.setHeader('Content-Type', attachment.mimeType);
    response.setHeader(
      'Content-Disposition',
      `attachment; filename="${attachment.filename}"`,
    );
    download.stream.pipe(response);
  }

  @Delete(':id')
  @Roles(...ALL_ROLES)
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    summary:
      'Delete file and metadata (agents: own uploads only; owner/admin: any)',
  })
  async remove(
    @CurrentMembership() membership: WorkspaceMember,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<void> {
    await this.attachmentsService.remove(membership.workspaceId, id, {
      userId: membership.userId,
      role: membership.role,
    });
  }
}
