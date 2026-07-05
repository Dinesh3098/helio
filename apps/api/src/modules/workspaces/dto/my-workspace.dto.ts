import { ApiProperty } from '@nestjs/swagger';
import { WorkspaceMemberRole } from '../../../database/entities';

export class MyWorkspaceDto {
  @ApiProperty({ format: 'uuid' })
  workspaceId: string;

  @ApiProperty({ example: 'Acme Inc' })
  name: string;

  @ApiProperty({ enum: WorkspaceMemberRole })
  role: WorkspaceMemberRole;
}
