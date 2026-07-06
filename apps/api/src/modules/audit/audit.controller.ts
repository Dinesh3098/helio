import { Controller, Get, Query, UseGuards } from '@nestjs/common';
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
  AuditLog,
  WorkspaceMember,
  WorkspaceMemberRole,
} from '../../database/entities';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { AuditService } from './audit.service';
import {
  AuditLogResponseDto,
  PaginatedAuditLogsDto,
  QueryAuditLogsDto,
} from './dto/audit.dto';

@ApiTags('audit')
@ApiBearerAuth()
@ApiHeader({
  name: 'x-workspace-id',
  required: false,
  description:
    'Workspace to operate on. Optional when the user belongs to exactly one workspace.',
})
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('audit')
export class AuditController {
  constructor(private readonly auditService: AuditService) {}

  @Get('logs')
  @Roles(WorkspaceMemberRole.OWNER, WorkspaceMemberRole.ADMIN)
  @ApiOperation({ summary: 'Workspace audit trail (newest first)' })
  @ApiOkResponse({ type: PaginatedAuditLogsDto })
  async list(
    @CurrentMembership() membership: WorkspaceMember,
    @Query() query: QueryAuditLogsDto,
  ): Promise<PaginatedAuditLogsDto> {
    const { data, total } = await this.auditService.list(
      membership.workspaceId,
      query,
    );
    return {
      data: data.map((log) => toResponse(log)),
      total,
      page: query.page,
      limit: query.limit,
    };
  }
}

export function toResponse(log: AuditLog): AuditLogResponseDto {
  return {
    id: log.id,
    actorName: log.actorUser?.name ?? null,
    resourceType: log.resourceType,
    resourceId: log.resourceId,
    action: log.action,
    metadata: log.metadata,
    ipAddress: log.ipAddress,
    createdAt: log.createdAt,
  };
}
