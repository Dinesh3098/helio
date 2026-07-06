import {
  BadRequestException,
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
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
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import type { Response } from 'express';
import { tmpdir } from 'node:os';
import { AttachmentsService } from '../attachments/attachments.service';
import { AttachmentResponseDto } from '../attachments/dto/attachment.dto';
import { CreateMessageDto } from '../messages/dto/create-message.dto';
import {
  MessageResponseDto,
  MessagesPageDto,
} from '../messages/dto/message-response.dto';
import { QueryMessagesDto } from '../messages/dto/query-messages.dto';
import { MessagesService } from '../messages/messages.service';
import { CurrentVisitor } from './decorators/current-visitor.decorator';
import { CreateWidgetSessionDto } from './dto/create-widget-session.dto';
import { WidgetSessionResponseDto } from './dto/widget-session-response.dto';
import type { VisitorPrincipal } from './interfaces/visitor-principal.interface';
import { WidgetAuthGuard } from './widget-auth.guard';
import { WidgetService } from './widget.service';

/**
 * Public, unauthenticated-visitor surface for the embeddable chat widget.
 * Conversation scope always comes from the visitor token — never from
 * request parameters.
 */
@ApiTags('widget')
@Controller('widget')
export class WidgetController {
  constructor(
    private readonly widgetService: WidgetService,
    private readonly messagesService: MessagesService,
    private readonly attachmentsService: AttachmentsService,
  ) {}

  @Post('session')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Bootstrap a visitor session (find-or-create, idempotent)',
    description:
      'Resolves the contact behind a stable visitorId and its active chat conversation, creating either on demand, and issues a visitor token.',
  })
  @ApiOkResponse({ type: WidgetSessionResponseDto })
  createSession(
    @Body() dto: CreateWidgetSessionDto,
  ): Promise<WidgetSessionResponseDto> {
    return this.widgetService.createSession(dto);
  }

  @Get('messages')
  @UseGuards(WidgetAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({
    summary: "Visitor's conversation history (keyset-paginated)",
  })
  @ApiOkResponse({ type: MessagesPageDto })
  listMessages(
    @CurrentVisitor() visitor: VisitorPrincipal,
    @Query() query: QueryMessagesDto,
  ): Promise<MessagesPageDto> {
    return this.messagesService.listForConversation(
      visitor.workspaceId,
      visitor.conversationId,
      query,
    );
  }

  @Post('attachments')
  @UseGuards(WidgetAuthGuard)
  @ApiBearerAuth()
  @UseInterceptors(
    FileInterceptor('file', {
      // Disk storage — see AttachmentsController; memory is never used.
      dest: tmpdir(),
      limits: { fileSize: 100 * 1024 * 1024, files: 1 },
    }),
  )
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      required: ['file'],
      properties: { file: { type: 'string', format: 'binary' } },
    },
  })
  @ApiOperation({
    summary: "Upload a file into the visitor's conversation (system upload)",
  })
  @ApiCreatedResponse({ type: AttachmentResponseDto })
  uploadAttachment(
    @CurrentVisitor() visitor: VisitorPrincipal,
    @UploadedFile() file: Express.Multer.File | undefined,
  ): Promise<AttachmentResponseDto> {
    if (!file) {
      throw new BadRequestException('Send the file as multipart field "file"');
    }
    // Scope is pinned by the token — visitors cannot pick a conversation.
    return this.attachmentsService.upload({
      workspaceId: visitor.workspaceId,
      uploadedByUserId: null,
      conversationId: visitor.conversationId,
      tempPath: file.path,
      originalFilename: file.originalname,
      mimeType: file.mimetype,
      size: file.size,
    });
  }

  @Get('attachments/:id/download')
  @UseGuards(WidgetAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({
    summary: "Download an attachment from the visitor's own conversation",
  })
  async downloadAttachment(
    @CurrentVisitor() visitor: VisitorPrincipal,
    @Param('id', ParseUUIDPipe) id: string,
    @Res() response: Response,
  ): Promise<void> {
    const { attachment, download } = await this.attachmentsService.download(
      visitor.workspaceId,
      id,
    );
    // Visitors may only reach files in their own pinned conversation.
    if (attachment.conversationId !== visitor.conversationId) {
      throw new BadRequestException('Attachment not found');
    }
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

  @Post('messages')
  @UseGuards(WidgetAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Send a visitor message (REST fallback for the socket path)',
  })
  @ApiCreatedResponse({ type: MessageResponseDto })
  createMessage(
    @CurrentVisitor() visitor: VisitorPrincipal,
    @Body() dto: CreateMessageDto,
  ): Promise<MessageResponseDto> {
    return this.messagesService.createContactMessage(visitor, dto);
  }
}
