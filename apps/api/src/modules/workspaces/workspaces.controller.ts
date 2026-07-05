import { Body, Controller, Get, Patch, UseGuards } from '@nestjs/common';
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
import { WorkspaceMember, WorkspaceMemberRole } from '../../database/entities';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
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
  constructor(private readonly workspacesService: WorkspacesService) {}

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
