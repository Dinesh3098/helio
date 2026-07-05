import { ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsEnum,
  IsIn,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
} from 'class-validator';
import { PaginationQueryDto } from '../../../common/dto/pagination-query.dto';
import {
  ConversationChannel,
  ConversationStatus,
} from '../../../database/entities';

const SORT_FIELDS = ['lastMessageAt', 'createdAt'] as const;
const SORT_ORDERS = ['ASC', 'DESC'] as const;

export class QueryConversationsDto extends PaginationQueryDto {
  @ApiPropertyOptional({ enum: ConversationStatus })
  @IsOptional()
  @IsEnum(ConversationStatus)
  status?: ConversationStatus;

  @ApiPropertyOptional({ enum: ConversationChannel })
  @IsOptional()
  @IsEnum(ConversationChannel)
  channel?: ConversationChannel;

  @ApiPropertyOptional({ format: 'uuid', description: 'Current assignee' })
  @IsOptional()
  @IsUUID()
  assignedToUserId?: string;

  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID()
  contactId?: string;

  @ApiPropertyOptional({ description: 'Matches contact name' })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  search?: string;

  @ApiPropertyOptional({ enum: SORT_FIELDS, default: 'lastMessageAt' })
  @IsOptional()
  @IsIn(SORT_FIELDS)
  sortBy: (typeof SORT_FIELDS)[number] = 'lastMessageAt';

  @ApiPropertyOptional({ enum: SORT_ORDERS, default: 'DESC' })
  @IsOptional()
  @IsIn(SORT_ORDERS)
  sortOrder: (typeof SORT_ORDERS)[number] = 'DESC';
}
