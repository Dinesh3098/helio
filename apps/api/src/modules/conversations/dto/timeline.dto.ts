import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { MessageResponseDto } from '../../messages/dto/message-response.dto';

export class TimelineEventDto {
  @ApiProperty({ format: 'uuid' })
  id: string;

  @ApiProperty({ example: 'conversation.status_changed' })
  action: string;

  @ApiPropertyOptional({ nullable: true, description: 'Null = system' })
  actorName: string | null;

  @ApiPropertyOptional({ nullable: true })
  metadata: Record<string, unknown> | null;

  @ApiProperty()
  createdAt: Date;
}

export class TimelineEntryDto {
  @ApiProperty({ enum: ['message', 'event'] })
  kind: 'message' | 'event';

  @ApiProperty()
  at: Date;

  @ApiPropertyOptional({ type: MessageResponseDto })
  message?: MessageResponseDto;

  @ApiPropertyOptional({ type: TimelineEventDto })
  event?: TimelineEventDto;
}

export class TimelineResponseDto {
  @ApiProperty({ type: TimelineEntryDto, isArray: true })
  entries: TimelineEntryDto[];
}
