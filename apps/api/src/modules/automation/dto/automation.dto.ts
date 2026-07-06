import { ApiProperty, ApiPropertyOptional, PartialType } from "@nestjs/swagger";
import { Type } from "class-transformer";
import {
  IsArray,
  IsBoolean,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Length,
  Max,
  Min,
} from "class-validator";
import {
  AutomationExecutionStatus,
  AutomationTrigger,
} from "../../../database/entities";

export class CreateRuleDto {
  @ApiProperty({ example: "Auto-assign new chats" })
  @IsString()
  @Length(1, 255)
  name: string;

  @ApiProperty({ enum: AutomationTrigger })
  @IsEnum(AutomationTrigger)
  trigger: AutomationTrigger;

  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @IsBoolean()
  enabled?: boolean;

  @ApiPropertyOptional({
    type: "array",
    items: { type: "object", additionalProperties: true },
    description:
      'Discriminated by "type": channel | status | priority | emailDomain | messageContains | assignedTo | timeOfDay',
  })
  @IsOptional()
  @IsArray()
  conditions?: unknown[];

  @ApiProperty({
    type: "array",
    items: { type: "object", additionalProperties: true },
    description:
      'Discriminated by "type": assign | setPriority | setStatus | aiSummary | aiReply | autoReply | addTag | removeTag',
  })
  @IsArray()
  actions: unknown[];
}

export class UpdateRuleDto extends PartialType(CreateRuleDto) {}

export class TestRuleDto {
  @ApiProperty({ format: "uuid", description: "Conversation to test against" })
  @IsUUID()
  conversationId: string;
}

export class RuleResponseDto {
  @ApiProperty({ format: "uuid" })
  id: string;

  @ApiProperty()
  name: string;

  @ApiProperty()
  enabled: boolean;

  @ApiProperty({ enum: AutomationTrigger })
  trigger: AutomationTrigger;

  @ApiProperty({
    type: "array",
    items: { type: "object", additionalProperties: true },
  })
  conditions: unknown[];

  @ApiProperty({
    type: "array",
    items: { type: "object", additionalProperties: true },
  })
  actions: unknown[];

  @ApiPropertyOptional({ nullable: true })
  createdByName: string | null;

  @ApiProperty()
  createdAt: Date;

  @ApiProperty()
  updatedAt: Date;
}

export class TestRuleResultDto {
  @ApiProperty({ description: "Whether the conditions matched" })
  matched: boolean;

  @ApiPropertyOptional({ format: "uuid" })
  executionId?: string;

  @ApiPropertyOptional({ enum: AutomationExecutionStatus })
  status?: AutomationExecutionStatus;

  @ApiPropertyOptional({ nullable: true })
  error?: string | null;
}

export class QueryHistoryDto {
  @ApiPropertyOptional({ format: "uuid", description: "Filter by rule" })
  @IsOptional()
  @IsUUID()
  ruleId?: string;

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

export class ExecutionResponseDto {
  @ApiProperty({ format: "uuid" })
  id: string;

  @ApiProperty({ format: "uuid" })
  ruleId: string;

  @ApiProperty()
  ruleName: string;

  @ApiProperty({ format: "uuid" })
  conversationId: string;

  @ApiProperty()
  contactName: string;

  @ApiProperty({ enum: AutomationExecutionStatus })
  status: AutomationExecutionStatus;

  @ApiPropertyOptional({ nullable: true })
  error: string | null;

  @ApiProperty()
  startedAt: Date;

  @ApiPropertyOptional({ nullable: true })
  finishedAt: Date | null;
}

export class PaginatedExecutionsDto {
  @ApiProperty({ type: ExecutionResponseDto, isArray: true })
  data: ExecutionResponseDto[];

  @ApiProperty()
  total: number;

  @ApiProperty()
  page: number;

  @ApiProperty()
  limit: number;
}
