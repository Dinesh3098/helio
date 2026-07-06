import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiHeader,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { CurrentMembership } from '../../common/decorators/current-membership.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { RolesGuard } from '../../common/guards/roles.guard';
import {
  ConversationStatus,
  WorkspaceMember,
  WorkspaceMemberRole,
} from '../../database/entities';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { ConversationsService } from './conversations.service';
import { AssignConversationDto } from './dto/assign-conversation.dto';
import {
  ConversationDetailResponseDto,
  ConversationResponseDto,
  PaginatedConversationsDto,
} from './dto/conversation-response.dto';
import { QueryConversationsDto } from './dto/query-conversations.dto';
import { UpdateConversationDto } from './dto/update-conversation.dto';

const ALL_ROLES = [
  WorkspaceMemberRole.OWNER,
  WorkspaceMemberRole.ADMIN,
  WorkspaceMemberRole.AGENT,
] as const;

@ApiTags('conversations')
@ApiBearerAuth()
@ApiHeader({
  name: 'x-workspace-id',
  required: false,
  description:
    'Workspace to operate on. Optional when the user belongs to exactly one workspace.',
})
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('conversations')
export class ConversationsController {
  constructor(private readonly conversationsService: ConversationsService) {}

  @Get()
  @Roles(...ALL_ROLES)
  @ApiOperation({ summary: 'List conversations (filters, paginated)' })
  @ApiOkResponse({ type: PaginatedConversationsDto })
  list(
    @CurrentMembership() membership: WorkspaceMember,
    @Query() query: QueryConversationsDto,
  ): Promise<PaginatedConversationsDto> {
    return this.conversationsService.list(membership.workspaceId, query);
  }

  @Get(':id')
  @Roles(...ALL_ROLES)
  @ApiOperation({
    summary: 'Conversation detail: contact, assignee, AI summary, counts',
  })
  @ApiOkResponse({ type: ConversationDetailResponseDto })
  getDetail(
    @CurrentMembership() membership: WorkspaceMember,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<ConversationDetailResponseDto> {
    return this.conversationsService.getDetail(membership.workspaceId, id);
  }

  @Patch(':id')
  @Roles(...ALL_ROLES)
  @ApiOperation({ summary: 'Update conversation status and/or priority' })
  @ApiOkResponse({ type: ConversationResponseDto })
  update(
    @CurrentMembership() membership: WorkspaceMember,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateConversationDto,
  ): Promise<ConversationResponseDto> {
    return this.conversationsService.update(membership.workspaceId, id, dto);
  }

  @Post(':id/assign')
  @Roles(...ALL_ROLES)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary:
      'Assign or unassign (owner/admin: anyone; agent: themselves only; null/omitted member unassigns)',
  })
  @ApiOkResponse({ type: ConversationResponseDto })
  assign(
    @CurrentMembership() membership: WorkspaceMember,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: AssignConversationDto,
  ): Promise<ConversationResponseDto> {
    return this.conversationsService.assign(membership, id, dto);
  }

  @Post(':id/resolve')
  @Roles(...ALL_ROLES)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Mark conversation RESOLVED' })
  @ApiOkResponse({ type: ConversationResponseDto })
  resolve(
    @CurrentMembership() membership: WorkspaceMember,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<ConversationResponseDto> {
    return this.conversationsService.setStatus(
      membership.workspaceId,
      id,
      ConversationStatus.RESOLVED,
    );
  }

  @Post(':id/snooze')
  @Roles(...ALL_ROLES)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Mark conversation SNOOZED' })
  @ApiOkResponse({ type: ConversationResponseDto })
  snooze(
    @CurrentMembership() membership: WorkspaceMember,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<ConversationResponseDto> {
    return this.conversationsService.setStatus(
      membership.workspaceId,
      id,
      ConversationStatus.SNOOZED,
    );
  }

  @Post(':id/reopen')
  @Roles(...ALL_ROLES)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Reopen conversation (OPEN)' })
  @ApiOkResponse({ type: ConversationResponseDto })
  reopen(
    @CurrentMembership() membership: WorkspaceMember,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<ConversationResponseDto> {
    return this.conversationsService.setStatus(
      membership.workspaceId,
      id,
      ConversationStatus.OPEN,
    );
  }
}
