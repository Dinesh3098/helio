import { ApiProperty } from '@nestjs/swagger';
import { ConversationStatus } from '../../../database/entities';

class WidgetContactDto {
  @ApiProperty({ format: 'uuid' })
  id: string;

  @ApiProperty()
  name: string;
}

class WidgetConversationDto {
  @ApiProperty({ format: 'uuid' })
  id: string;

  @ApiProperty({ enum: ConversationStatus })
  status: ConversationStatus;
}

class WidgetWorkspaceDto {
  @ApiProperty()
  name: string;
}

export class WidgetSessionResponseDto {
  @ApiProperty({
    description:
      'Short-lived JWT scoped to this visitor and conversation. Used as the Bearer token for /widget endpoints and as the Socket.IO handshake credential.',
  })
  visitorToken: string;

  @ApiProperty({ type: WidgetContactDto })
  contact: WidgetContactDto;

  @ApiProperty({ type: WidgetConversationDto })
  conversation: WidgetConversationDto;

  @ApiProperty({ type: WidgetWorkspaceDto })
  workspace: WidgetWorkspaceDto;
}
