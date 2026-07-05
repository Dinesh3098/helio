import { ApiProperty } from '@nestjs/swagger';
import { IsUUID } from 'class-validator';

export class AssignConversationDto {
  @ApiProperty({ format: 'uuid', description: 'Workspace member to assign' })
  @IsUUID()
  workspaceMemberId: string;
}
