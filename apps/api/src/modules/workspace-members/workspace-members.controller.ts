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
} from "@nestjs/common";
import {
  ApiBearerAuth,
  ApiCreatedResponse,
  ApiHeader,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from "@nestjs/swagger";
import { CurrentMembership } from "../../common/decorators/current-membership.decorator";
import { Roles } from "../../common/decorators/roles.decorator";
import { RolesGuard } from "../../common/guards/roles.guard";
import { WorkspaceMember, WorkspaceMemberRole } from "../../database/entities";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import { InviteMemberDto } from "./dto/invite-member.dto";
import { MemberResponseDto } from "./dto/member-response.dto";
import { UpdateMemberRoleDto } from "./dto/update-member-role.dto";
import { WorkspaceMembersService } from "./workspace-members.service";

@ApiTags("workspace members")
@ApiBearerAuth()
@ApiHeader({
  name: "x-workspace-id",
  required: false,
  description:
    "Workspace to operate on. Optional when the user belongs to exactly one workspace.",
})
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller("workspace/members")
export class WorkspaceMembersController {
  constructor(
    private readonly workspaceMembersService: WorkspaceMembersService,
  ) {}

  @Get()
  @Roles(
    WorkspaceMemberRole.OWNER,
    WorkspaceMemberRole.ADMIN,
    WorkspaceMemberRole.AGENT,
  )
  @ApiOperation({ summary: "List workspace members (oldest first)" })
  @ApiOkResponse({ type: MemberResponseDto, isArray: true })
  listMembers(
    @CurrentMembership() membership: WorkspaceMember,
  ): Promise<MemberResponseDto[]> {
    return this.workspaceMembersService.listMembers(membership.workspaceId);
  }

  @Post()
  @Roles(WorkspaceMemberRole.OWNER, WorkspaceMemberRole.ADMIN)
  @ApiOperation({ summary: "Invite an existing user into the workspace" })
  @ApiCreatedResponse({ type: MemberResponseDto })
  invite(
    @CurrentMembership() membership: WorkspaceMember,
    @Body() dto: InviteMemberDto,
  ): Promise<MemberResponseDto> {
    return this.workspaceMembersService.invite(membership, dto);
  }

  @Patch(":memberId")
  @Roles(WorkspaceMemberRole.OWNER, WorkspaceMemberRole.ADMIN)
  @ApiOperation({ summary: "Change a member's role" })
  @ApiOkResponse({ type: MemberResponseDto })
  updateRole(
    @CurrentMembership() membership: WorkspaceMember,
    @Param("memberId", ParseUUIDPipe) memberId: string,
    @Body() dto: UpdateMemberRoleDto,
  ): Promise<MemberResponseDto> {
    return this.workspaceMembersService.updateRole(membership, memberId, dto);
  }

  @Delete(":memberId")
  @Roles(WorkspaceMemberRole.OWNER, WorkspaceMemberRole.ADMIN)
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: "Remove a member from the workspace" })
  async removeMember(
    @CurrentMembership() membership: WorkspaceMember,
    @Param("memberId", ParseUUIDPipe) memberId: string,
  ): Promise<void> {
    await this.workspaceMembersService.remove(membership, memberId);
  }
}
