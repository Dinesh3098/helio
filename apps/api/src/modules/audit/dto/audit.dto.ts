import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

export class QueryAuditLogsDto {
  @ApiPropertyOptional({ example: 'conversation' })
  @IsOptional()
  @IsString()
  @MaxLength(64)
  resourceType?: string;

  @ApiPropertyOptional({ format: 'uuid', description: 'Filter by actor' })
  @IsOptional()
  @IsUUID()
  actorUserId?: string;

  @ApiPropertyOptional({ default: 1, minimum: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page: number = 1;

  @ApiPropertyOptional({ default: 25, minimum: 1, maximum: 100 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit: number = 25;
}

export class AuditLogResponseDto {
  @ApiProperty({ format: 'uuid' })
  id: string;

  @ApiPropertyOptional({ nullable: true, description: 'Null = system event' })
  actorName: string | null;

  @ApiProperty()
  resourceType: string;

  @ApiPropertyOptional({ nullable: true })
  resourceId: string | null;

  @ApiProperty({ example: 'conversation.status_changed' })
  action: string;

  @ApiPropertyOptional({ nullable: true })
  metadata: Record<string, unknown> | null;

  @ApiPropertyOptional({ nullable: true })
  ipAddress: string | null;

  @ApiProperty()
  createdAt: Date;
}

export class PaginatedAuditLogsDto {
  @ApiProperty({ type: AuditLogResponseDto, isArray: true })
  data: AuditLogResponseDto[];

  @ApiProperty()
  total: number;

  @ApiProperty()
  page: number;

  @ApiProperty()
  limit: number;
}
