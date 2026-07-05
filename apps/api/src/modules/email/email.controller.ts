import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
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
import { MessageResponseDto } from '../messages/dto/message-response.dto';
import {
  CreateEmailAccountDto,
  EmailAccountResponseDto,
  UpdateEmailAccountDto,
} from './dto/email-account.dto';
import { SendEmailReplyDto } from './dto/send-email.dto';
import { EmailService } from './email.service';

const ALL_ROLES = [
  WorkspaceMemberRole.OWNER,
  WorkspaceMemberRole.ADMIN,
  WorkspaceMemberRole.AGENT,
] as const;

// Account management is workspace configuration — owner/admin territory.
const MANAGER_ROLES = [
  WorkspaceMemberRole.OWNER,
  WorkspaceMemberRole.ADMIN,
] as const;

@ApiTags('email')
@ApiBearerAuth()
@ApiHeader({
  name: 'x-workspace-id',
  required: false,
  description:
    'Workspace to operate on. Optional when the user belongs to exactly one workspace.',
})
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('email')
export class EmailController {
  constructor(private readonly emailService: EmailService) {}

  @Get('accounts')
  @Roles(...MANAGER_ROLES)
  @ApiOperation({ summary: "Workspace's connected email accounts" })
  @ApiOkResponse({ type: EmailAccountResponseDto, isArray: true })
  listAccounts(
    @CurrentMembership() membership: WorkspaceMember,
  ): Promise<EmailAccountResponseDto[]> {
    return this.emailService.listAccounts(membership.workspaceId);
  }

  @Post('accounts')
  @Roles(...MANAGER_ROLES)
  @ApiOperation({ summary: 'Connect an email account' })
  @ApiCreatedResponse({ type: EmailAccountResponseDto })
  createAccount(
    @CurrentMembership() membership: WorkspaceMember,
    @Body() dto: CreateEmailAccountDto,
  ): Promise<EmailAccountResponseDto> {
    return this.emailService.createAccount(membership.workspaceId, dto);
  }

  @Patch('accounts/:id')
  @Roles(...MANAGER_ROLES)
  @ApiOperation({ summary: 'Update an email account' })
  @ApiOkResponse({ type: EmailAccountResponseDto })
  updateAccount(
    @CurrentMembership() membership: WorkspaceMember,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateEmailAccountDto,
  ): Promise<EmailAccountResponseDto> {
    return this.emailService.updateAccount(membership.workspaceId, id, dto);
  }

  @Delete('accounts/:id')
  @Roles(...MANAGER_ROLES)
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Disconnect an email account' })
  async removeAccount(
    @CurrentMembership() membership: WorkspaceMember,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<void> {
    await this.emailService.removeAccount(membership.workspaceId, id);
  }

  @Post('conversations/:conversationId/send')
  @Roles(...ALL_ROLES)
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary:
      'Send an agent email reply (delivers via provider, records a Message)',
  })
  @ApiCreatedResponse({ type: MessageResponseDto })
  sendReply(
    @CurrentMembership() membership: WorkspaceMember,
    @CurrentUser() user: AuthenticatedUser,
    @Param('conversationId', ParseUUIDPipe) conversationId: string,
    @Body() dto: SendEmailReplyDto,
  ): Promise<MessageResponseDto> {
    return this.emailService.sendReply(
      user,
      membership.workspaceId,
      conversationId,
      dto.content,
    );
  }
}
