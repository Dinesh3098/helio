import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiCreatedResponse,
  ApiHeader,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { CurrentMembership } from '../../common/decorators/current-membership.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { RolesGuard } from '../../common/guards/roles.guard';
import type { AuthenticatedUser } from '../../common/interfaces/authenticated-user.interface';
import { WorkspaceMember, WorkspaceMemberRole } from '../../database/entities';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CreateMessageDto } from './dto/create-message.dto';
import {
  MessageResponseDto,
  MessagesPageDto,
} from './dto/message-response.dto';
import { QueryMessagesDto } from './dto/query-messages.dto';
import { MessagesService } from './messages.service';

const ALL_ROLES = [
  WorkspaceMemberRole.OWNER,
  WorkspaceMemberRole.ADMIN,
  WorkspaceMemberRole.AGENT,
] as const;

@ApiTags('messages')
@ApiBearerAuth()
@ApiHeader({
  name: 'x-workspace-id',
  required: false,
  description:
    'Workspace to operate on. Optional when the user belongs to exactly one workspace.',
})
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('conversations/:conversationId/messages')
export class MessagesController {
  constructor(private readonly messagesService: MessagesService) {}

  @Get()
  @Roles(...ALL_ROLES)
  @ApiOperation({
    summary: 'List messages oldest→newest (keyset-paginated)',
    description:
      'Without a cursor, returns the newest page. Pass nextCursor to walk toward older messages.',
  })
  @ApiOkResponse({ type: MessagesPageDto })
  list(
    @CurrentMembership() membership: WorkspaceMember,
    @Param('conversationId', ParseUUIDPipe) conversationId: string,
    @Query() query: QueryMessagesDto,
  ): Promise<MessagesPageDto> {
    return this.messagesService.listForConversation(
      membership.workspaceId,
      conversationId,
      query,
    );
  }

  @Post()
  @Roles(...ALL_ROLES)
  @ApiOperation({
    summary: 'Send an agent message',
    description:
      'Rejects resolved conversations (409). A message in a snoozed conversation reopens it.',
  })
  @ApiCreatedResponse({ type: MessageResponseDto })
  create(
    @CurrentMembership() membership: WorkspaceMember,
    @CurrentUser() user: AuthenticatedUser,
    @Param('conversationId', ParseUUIDPipe) conversationId: string,
    @Body() dto: CreateMessageDto,
  ): Promise<MessageResponseDto> {
    return this.messagesService.createAgentMessage(
      user,
      membership.workspaceId,
      conversationId,
      dto,
    );
  }
}
