import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { Type } from "class-transformer";
import {
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
} from "class-validator";

export class HelpWorkspaceQueryDto {
  @ApiProperty({
    format: "uuid",
    description: "Workspace whose help center to read",
  })
  @IsUUID()
  workspaceId: string;
}

export class HelpSearchQueryDto extends HelpWorkspaceQueryDto {
  @ApiProperty({ description: "Search terms" })
  @IsString()
  @MaxLength(255)
  q: string;

  @ApiPropertyOptional({ default: 20, minimum: 1, maximum: 50 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(50)
  limit: number = 20;
}

export class PublicArticleSummaryDto {
  @ApiProperty()
  title: string;

  @ApiProperty()
  slug: string;

  @ApiPropertyOptional({ nullable: true })
  excerpt: string | null;

  @ApiProperty()
  updatedAt: Date;
}

export class PublicCategoryDto {
  @ApiProperty({ format: "uuid" })
  id: string;

  @ApiProperty()
  name: string;

  @ApiProperty({ type: PublicArticleSummaryDto, isArray: true })
  articles: PublicArticleSummaryDto[];
}

export class PublicHelpCenterDto {
  @ApiProperty()
  workspaceName: string;

  @ApiProperty({ type: PublicCategoryDto, isArray: true })
  categories: PublicCategoryDto[];
}

export class PublicArticleDto extends PublicArticleSummaryDto {
  @ApiProperty({ description: "Markdown body" })
  content: string;

  @ApiProperty()
  categoryName: string;

  @ApiProperty()
  workspaceName: string;
}
