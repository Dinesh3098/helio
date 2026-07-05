import { Body, Controller, Get, Patch, UseGuards } from '@nestjs/common';
import {
  ApiBearerAuth,
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
import { WorkspaceMembersService } from '../workspace-members/workspace-members.service';
import { MyWorkspaceDto } from './dto/my-workspace.dto';
import { UpdateWorkspaceDto } from './dto/update-workspace.dto';
import { WorkspaceResponseDto } from './dto/workspace-response.dto';
import { WorkspacesService } from './workspaces.service';

@ApiTags('workspace')
@ApiBearerAuth()
@ApiHeader({
  name: 'x-workspace-id',
  required: false,
  description:
    'Workspace to operate on. Optional when the user belongs to exactly one workspace.',
})
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('workspace')
export class WorkspacesController {
  constructor(
    private readonly workspacesService: WorkspacesService,
    private readonly workspaceMembersService: WorkspaceMembersService,
  ) {}

  /**
   * Deliberately no @Roles(): RolesGuard skips role-less routes, so this
   * works without an x-workspace-id header — it's how a multi-workspace
   * client discovers which id to send in the first place.
   */
  @Get('mine')
  @ApiOperation({ summary: "All workspaces the current user belongs to" })
  @ApiOkResponse({ type: MyWorkspaceDto, isArray: true })
  listMine(@CurrentUser() user: AuthenticatedUser): Promise<MyWorkspaceDto[]> {
    return this.workspaceMembersService.listForUser(user.id);
  }

  @Get()
  @Roles(
    WorkspaceMemberRole.OWNER,
    WorkspaceMemberRole.ADMIN,
    WorkspaceMemberRole.AGENT,
  )
  @ApiOperation({ summary: "Current user's workspace" })
  @ApiOkResponse({ type: WorkspaceResponseDto })
  getWorkspace(
    @CurrentMembership() membership: WorkspaceMember,
  ): Promise<WorkspaceResponseDto> {
    return this.workspacesService.getById(membership.workspaceId);
  }

  @Patch()
  @Roles(WorkspaceMemberRole.OWNER)
  @ApiOperation({ summary: 'Rename the workspace (owner only)' })
  @ApiOkResponse({ type: WorkspaceResponseDto })
  updateWorkspace(
    @CurrentMembership() membership: WorkspaceMember,
    @Body() dto: UpdateWorkspaceDto,
  ): Promise<WorkspaceResponseDto> {
    return this.workspacesService.updateName(membership.workspaceId, dto);
  }
}
