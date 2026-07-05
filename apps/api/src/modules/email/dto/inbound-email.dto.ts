import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsArray,
  IsEmail,
  IsInt,
  IsOptional,
  IsString,
  Length,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';

export class InboundAttachmentDto {
  @ApiProperty({ example: 'invoice.pdf' })
  @IsString()
  @Length(1, 255)
  filename: string;

  @ApiProperty({ example: 'application/pdf' })
  @IsString()
  @Length(1, 255)
  mimeType: string;

  @ApiProperty({ example: 52431 })
  @Type(() => Number)
  @IsInt()
  @Min(0)
  size: number;

  @ApiPropertyOptional({ nullable: true, description: 'External URL, if any' })
  @IsOptional()
  @IsString()
  @MaxLength(2048)
  url?: string;
}

/** Simulated provider webhook payload (RFC 5322-shaped). */
export class InboundEmailDto {
  @ApiProperty({ example: 'customer@gmail.com' })
  @IsEmail()
  @MaxLength(255)
  from: string;

  @ApiPropertyOptional({ example: 'Jane Customer' })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  fromName?: string;

  @ApiProperty({
    example: 'support@acme.com',
    description: 'The workspace email account that received this message',
  })
  @IsEmail()
  @MaxLength(255)
  to: string;

  @ApiPropertyOptional({ example: 'Problem with my invoice' })
  @IsOptional()
  @IsString()
  @MaxLength(998)
  subject?: string;

  @ApiProperty({ example: '<abc123@mail.gmail.com>' })
  @IsString()
  @Length(1, 998)
  messageId: string;

  @ApiPropertyOptional({ example: '<prev-id@helio.mail>' })
  @IsOptional()
  @IsString()
  @MaxLength(998)
  inReplyTo?: string;

  @ApiPropertyOptional({
    description: 'Space-separated chain of prior message ids',
  })
  @IsOptional()
  @IsString()
  @MaxLength(10_000)
  references?: string;

  @ApiProperty({ description: 'Plain-text body' })
  @IsString()
  @Length(1, 100_000)
  text: string;

  @ApiPropertyOptional({ nullable: true, description: 'HTML body, if any' })
  @IsOptional()
  @IsString()
  @MaxLength(500_000)
  html?: string;

  @ApiPropertyOptional({ type: InboundAttachmentDto, isArray: true })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => InboundAttachmentDto)
  attachments?: InboundAttachmentDto[];
}

export class InboundEmailResultDto {
  @ApiProperty({ format: 'uuid' })
  conversationId: string;

  @ApiProperty({ format: 'uuid' })
  messageId: string;

  @ApiProperty({ description: 'True when an existing thread was matched' })
  threadReused: boolean;
}
