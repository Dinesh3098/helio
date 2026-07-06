import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import {
  ConversationChannel,
  ConversationPriority,
  ConversationStatus,
} from "../../../database/entities";
import { ContactResponseDto } from "../../contacts/dto/contact-response.dto";

export class ConversationResponseDto {
  @ApiProperty({ format: "uuid" })
  id: string;

  @ApiProperty({ format: "uuid" })
  contactId: string;

  @ApiProperty()
  contactName: string;

  @ApiProperty({ enum: ConversationChannel })
  channel: ConversationChannel;

  @ApiProperty({ enum: ConversationStatus })
  status: ConversationStatus;

  @ApiProperty({ enum: ConversationPriority })
  priority: ConversationPriority;

  @ApiPropertyOptional({ nullable: true })
  subject: string | null;

  @ApiProperty({ type: String, isArray: true })
  tags: string[];

  @ApiPropertyOptional({ format: "uuid", nullable: true })
  assignedToUserId: string | null;

  @ApiPropertyOptional({ nullable: true })
  lastMessagePreview: string | null;

  @ApiPropertyOptional({ nullable: true })
  lastMessageAt: Date | null;

  @ApiProperty()
  createdAt: Date;

  @ApiProperty()
  updatedAt: Date;
}

export class ConversationAssigneeDto {
  @ApiProperty({ format: "uuid" })
  userId: string;

  @ApiProperty()
  name: string;

  @ApiProperty()
  email: string;
}

export class ConversationSummaryDto {
  @ApiProperty()
  summary: string;

  @ApiProperty()
  model: string;

  @ApiProperty()
  updatedAt: Date;
}

export class ConversationDetailResponseDto extends ConversationResponseDto {
  @ApiProperty({ type: ContactResponseDto })
  contact: ContactResponseDto;

  @ApiPropertyOptional({ type: ConversationAssigneeDto, nullable: true })
  assignee: ConversationAssigneeDto | null;

  @ApiPropertyOptional({ type: ConversationSummaryDto, nullable: true })
  aiSummary: ConversationSummaryDto | null;

  @ApiProperty({ description: "Total messages in this conversation" })
  messagesCount: number;
}

export class PaginatedConversationsDto {
  @ApiProperty({ type: ConversationResponseDto, isArray: true })
  data: ConversationResponseDto[];

  @ApiProperty()
  total: number;

  @ApiProperty()
  page: number;

  @ApiProperty()
  limit: number;
}
