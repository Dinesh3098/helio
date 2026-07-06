import { ApiProperty, ApiPropertyOptional, PartialType } from "@nestjs/swagger";
import { Transform, Type } from "class-transformer";
import {
  IsBoolean,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Length,
  Max,
  MaxLength,
  Min,
} from "class-validator";

const SORT_FIELDS = ["updatedAt", "createdAt", "title"] as const;
const SORT_ORDERS = ["ASC", "DESC"] as const;

export type ArticleSortField = (typeof SORT_FIELDS)[number];

export class CreateArticleDto {
  @ApiProperty({ example: "How to install the chat widget" })
  @IsString()
  @Length(1, 255)
  title: string;

  @ApiProperty({ description: "Markdown body" })
  @IsString()
  @Length(1, 100_000)
  content: string;

  @ApiPropertyOptional({ maxLength: 500 })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  excerpt?: string;

  @ApiProperty({ format: "uuid" })
  @IsUUID()
  categoryId: string;

  @ApiPropertyOptional({ default: false })
  @IsOptional()
  @IsBoolean()
  isPublished?: boolean;
}

export class UpdateArticleDto extends PartialType(CreateArticleDto) {}

export class QueryArticlesDto {
  @ApiPropertyOptional({
    description: "Full-text search on title/excerpt/content",
  })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  search?: string;

  @ApiPropertyOptional({ format: "uuid" })
  @IsOptional()
  @IsUUID()
  categoryId?: string;

  @ApiPropertyOptional({ description: "Filter by publish state" })
  @IsOptional()
  // Type(() => Boolean) coerces the string "false" to true; map explicitly.
  @Transform(({ value }) => {
    if (value === "true" || value === true) return true;
    if (value === "false" || value === false) return false;
    return value as unknown;
  })
  @IsBoolean()
  published?: boolean;

  @ApiPropertyOptional({
    enum: SORT_FIELDS,
    default: "updatedAt",
    description: "Ignored while searching — results are relevance-ranked.",
  })
  @IsOptional()
  @IsIn(SORT_FIELDS)
  sortBy: ArticleSortField = "updatedAt";

  @ApiPropertyOptional({ enum: SORT_ORDERS, default: "DESC" })
  @IsOptional()
  @IsIn(SORT_ORDERS)
  sortOrder: (typeof SORT_ORDERS)[number] = "DESC";

  @ApiPropertyOptional({ default: 1, minimum: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page: number = 1;

  @ApiPropertyOptional({ default: 20, minimum: 1, maximum: 100 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit: number = 20;

  get skip(): number {
    return (this.page - 1) * this.limit;
  }
}

export class ArticleSummaryDto {
  @ApiProperty({ format: "uuid" })
  id: string;

  @ApiProperty()
  title: string;

  @ApiProperty()
  slug: string;

  @ApiPropertyOptional({ nullable: true })
  excerpt: string | null;

  @ApiProperty()
  isPublished: boolean;

  @ApiProperty({ format: "uuid" })
  categoryId: string;

  @ApiProperty()
  categoryName: string;

  @ApiPropertyOptional({ nullable: true, description: "Last editor name" })
  updatedByName: string | null;

  @ApiProperty()
  createdAt: Date;

  @ApiProperty()
  updatedAt: Date;
}

export class ArticleResponseDto extends ArticleSummaryDto {
  @ApiProperty({ description: "Markdown body" })
  content: string;

  @ApiPropertyOptional({ nullable: true })
  createdByName: string | null;
}

export class PaginatedArticlesDto {
  @ApiProperty({ type: ArticleSummaryDto, isArray: true })
  data: ArticleSummaryDto[];

  @ApiProperty()
  total: number;

  @ApiProperty()
  page: number;

  @ApiProperty()
  limit: number;
}
