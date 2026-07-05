import { ApiProperty } from '@nestjs/swagger';
import { WorkspaceMemberRole } from '../../../database/entities';

export class MemberResponseDto {
  @ApiProperty({ format: 'uuid', description: 'Membership id' })
  id: string;

  @ApiProperty({ format: 'uuid' })
  userId: string;

  @ApiProperty({ example: 'Jane Doe' })
  name: string;

  @ApiProperty({ example: 'jane@acme.com' })
  email: string;

  @ApiProperty({ enum: WorkspaceMemberRole })
  role: WorkspaceMemberRole;

  @ApiProperty()
  joinedAt: Date;
}
