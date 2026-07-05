import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiCreatedResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
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
