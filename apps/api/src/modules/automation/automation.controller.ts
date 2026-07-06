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
import { AutomationService } from './automation.service';
import {
  CreateRuleDto,
  PaginatedExecutionsDto,
  QueryHistoryDto,
  RuleResponseDto,
  TestRuleDto,
  TestRuleResultDto,
  UpdateRuleDto,
} from './dto/automation.dto';

// Automation changes workspace behavior — owner/admin territory.
const MANAGER_ROLES = [
  WorkspaceMemberRole.OWNER,
  WorkspaceMemberRole.ADMIN,
] as const;

@ApiTags('automation')
@ApiBearerAuth()
@ApiHeader({
  name: 'x-workspace-id',
  required: false,
  description:
    'Workspace to operate on. Optional when the user belongs to exactly one workspace.',
})
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('automation')
export class AutomationController {
  constructor(private readonly automationService: AutomationService) {}

  @Get('rules')
  @Roles(...MANAGER_ROLES)
  @ApiOperation({ summary: "Workspace's automation rules" })
  @ApiOkResponse({ type: RuleResponseDto, isArray: true })
  list(
    @CurrentMembership() membership: WorkspaceMember,
  ): Promise<RuleResponseDto[]> {
    return this.automationService.list(membership.workspaceId);
  }

  @Post('rules')
  @Roles(...MANAGER_ROLES)
  @ApiOperation({ summary: 'Create an automation rule' })
  @ApiCreatedResponse({ type: RuleResponseDto })
  create(
    @CurrentMembership() membership: WorkspaceMember,
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateRuleDto,
  ): Promise<RuleResponseDto> {
    return this.automationService.create(membership.workspaceId, user, dto);
  }

  @Patch('rules/:id')
  @Roles(...MANAGER_ROLES)
  @ApiOperation({ summary: 'Update a rule (incl. enable/disable)' })
  @ApiOkResponse({ type: RuleResponseDto })
  update(
    @CurrentMembership() membership: WorkspaceMember,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateRuleDto,
  ): Promise<RuleResponseDto> {
    return this.automationService.update(membership.workspaceId, id, dto);
  }

  @Delete('rules/:id')
  @Roles(...MANAGER_ROLES)
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete a rule (its history goes with it)' })
  async remove(
    @CurrentMembership() membership: WorkspaceMember,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<void> {
    await this.automationService.remove(membership.workspaceId, id);
  }

  @Post('rules/:id/test')
  @Roles(...MANAGER_ROLES)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary:
      'Run a rule against a conversation now (ignores enabled; actions DO execute)',
  })
  @ApiOkResponse({ type: TestRuleResultDto })
  test(
    @CurrentMembership() membership: WorkspaceMember,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: TestRuleDto,
  ): Promise<TestRuleResultDto> {
    return this.automationService.test(
      membership.workspaceId,
      id,
      dto.conversationId,
    );
  }

  @Get('history')
  @Roles(...MANAGER_ROLES)
  @ApiOperation({ summary: 'Execution history (paginated, newest first)' })
  @ApiOkResponse({ type: PaginatedExecutionsDto })
  history(
    @CurrentMembership() membership: WorkspaceMember,
    @Query() query: QueryHistoryDto,
  ): Promise<PaginatedExecutionsDto> {
    return this.automationService.history(membership.workspaceId, query);
  }
}
