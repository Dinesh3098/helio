import { ApiPropertyOptional } from "@nestjs/swagger";
import { Transform } from "class-transformer";
import {
  ArrayMaxSize,
  IsArray,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
} from "class-validator";

export class CreateMessageDto {
  @ApiPropertyOptional({
    example: "Hello! How can I help?",
    maxLength: 10_000,
    description: "Optional when attachments are present.",
  })
  @Transform(({ value }) =>
    typeof value === "string" ? value.trim() : (value as unknown),
  )
  @IsOptional()
  @IsString()
  @MaxLength(10_000, { message: "Message content is too long" })
  content?: string;

  @ApiPropertyOptional({
    type: String,
    isArray: true,
    format: "uuid",
    description: "Previously uploaded attachments to send with this message",
  })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(10)
  @IsUUID(undefined, { each: true })
  attachmentIds?: string[];
}
