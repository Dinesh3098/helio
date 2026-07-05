import { ApiProperty } from '@nestjs/swagger';
import { IsIn } from 'class-validator';
import { WorkspaceMemberRole } from '../../../database/entities';

// OWNER cannot be assigned — the owner role never moves via this API.
const ASSIGNABLE_ROLES = [
  WorkspaceMemberRole.ADMIN,
  WorkspaceMemberRole.AGENT,
] as const;

export class UpdateMemberRoleDto {
  @ApiProperty({ enum: ASSIGNABLE_ROLES, example: WorkspaceMemberRole.ADMIN })
  @IsIn(ASSIGNABLE_ROLES)
  role: WorkspaceMemberRole;
}
