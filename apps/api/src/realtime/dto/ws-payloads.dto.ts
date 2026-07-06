import { IsUUID } from 'class-validator';
import { CreateMessageDto } from '../../modules/messages/dto/create-message.dto';

export class ConversationRoomDto {
  @IsUUID()
  conversationId: string;
}

export class WorkspaceRoomDto {
  @IsUUID()
  workspaceId: string;
}

/** Same content rules as the REST endpoint — one source of validation. */
export class SendMessageWsDto extends CreateMessageDto {
  @IsUUID()
  conversationId: string;
}
