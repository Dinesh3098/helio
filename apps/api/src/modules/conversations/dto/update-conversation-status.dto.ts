import { ApiProperty } from '@nestjs/swagger';
import { IsEnum } from 'class-validator';
import { ConversationStatus } from '../../../database/entities';

export class UpdateConversationStatusDto {
  @ApiProperty({ enum: ConversationStatus })
  @IsEnum(ConversationStatus)
  status: ConversationStatus;
}
