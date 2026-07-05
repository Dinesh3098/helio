import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsOptional, IsString, Length, MaxLength } from 'class-validator';
import { REWRITE_STYLES } from '../prompts/rewrite.prompt';
import type { RewriteStyle } from '../prompts/rewrite.prompt';

export class SuggestReplyDto {
  @ApiPropertyOptional({
    example: 'Reply politely and offer a refund',
    description: 'Optional steering instructions from the agent',
  })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  instructions?: string;
}

export class RewriteDto {
  @ApiProperty({ description: 'The draft to rewrite' })
  @IsString()
  @Length(1, 10_000)
  draft: string;

  @ApiProperty({ enum: REWRITE_STYLES })
  @IsIn(REWRITE_STYLES)
  style: RewriteStyle;
}

export class SummaryResponseDto {
  @ApiProperty()
  summary: string;

  @ApiProperty()
  model: string;

  @ApiProperty()
  updatedAt: Date;

  @ApiProperty({
    description:
      'True when messages arrived after this summary was generated',
  })
  stale: boolean;
}

export class GeneratedTextResponseDto {
  @ApiProperty()
  text: string;
}

export class ClassificationResponseDto {
  @ApiProperty({ example: 'Billing' })
  category: string;

  @ApiProperty({ example: 'HIGH', enum: ['LOW', 'MEDIUM', 'HIGH'] })
  priority: string;

  @ApiProperty({
    example: 'NEGATIVE',
    enum: ['POSITIVE', 'NEUTRAL', 'NEGATIVE'],
  })
  sentiment: string;

  @ApiProperty({ example: 'Refund Request' })
  intent: string;
}

export class KbSuggestionDto {
  @ApiProperty({ format: 'uuid' })
  articleId: string;

  @ApiProperty()
  title: string;

  @ApiProperty()
  slug: string;

  @ApiProperty({ description: 'Why this article helps, per the model' })
  reason: string;
}
