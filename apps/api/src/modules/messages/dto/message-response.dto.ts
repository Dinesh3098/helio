import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import {
  MessageSenderType,
  MessageType,
  type MessageMetadata,
} from "../../../database/entities";

export class MessageResponseDto {
  @ApiProperty({ format: "uuid" })
  id: string;

  @ApiProperty({ format: "uuid" })
  conversationId: string;

  @ApiProperty({ enum: MessageSenderType })
  senderType: MessageSenderType;

  @ApiPropertyOptional({ format: "uuid", nullable: true })
  senderId: string | null;

  @ApiPropertyOptional({
    nullable: true,
    description: "Resolved display name; null for system messages.",
  })
  senderName: string | null;

  @ApiProperty()
  content: string;

  @ApiProperty({ enum: MessageType })
  messageType: MessageType;

  @ApiPropertyOptional({
    nullable: true,
    description:
      "Channel extras — email envelope (subject/from/to/attachments); null for chat.",
  })
  metadata: MessageMetadata | null;

  @ApiProperty()
  createdAt: Date;
}

export class MessagesPageDto {
  @ApiProperty({
    type: MessageResponseDto,
    isArray: true,
    description: "Ordered oldest to newest.",
  })
  data: MessageResponseDto[];

  @ApiPropertyOptional({
    nullable: true,
    description:
      "Pass as ?cursor= to fetch the previous (older) page; null when no older messages exist.",
  })
  nextCursor: string | null;
}
