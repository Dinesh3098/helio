import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { IsOptional, IsUUID } from "class-validator";

export class UploadAttachmentDto {
  @ApiPropertyOptional({
    format: "uuid",
    description: "Conversation this file belongs to (validated in-workspace)",
  })
  @IsOptional()
  @IsUUID()
  conversationId?: string;
}

export class AttachmentResponseDto {
  @ApiProperty({ format: "uuid" })
  id: string;

  @ApiPropertyOptional({ format: "uuid", nullable: true })
  conversationId: string | null;

  @ApiPropertyOptional({ format: "uuid", nullable: true })
  messageId: string | null;

  @ApiProperty({ example: "invoice.pdf" })
  filename: string;

  @ApiProperty({ example: "application/pdf" })
  mimeType: string;

  @ApiProperty({ example: 52431 })
  size: number;

  @ApiProperty()
  createdAt: Date;
}
