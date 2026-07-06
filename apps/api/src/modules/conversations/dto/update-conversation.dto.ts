import { ApiPropertyOptional } from "@nestjs/swagger";
import { IsEnum, IsOptional } from "class-validator";
import {
  ConversationPriority,
  ConversationStatus,
} from "../../../database/entities";

export class UpdateConversationDto {
  @ApiPropertyOptional({ enum: ConversationStatus })
  @IsOptional()
  @IsEnum(ConversationStatus)
  status?: ConversationStatus;

  @ApiPropertyOptional({ enum: ConversationPriority })
  @IsOptional()
  @IsEnum(ConversationPriority)
  priority?: ConversationPriority;
}
