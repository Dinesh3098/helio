import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, MaxLength } from 'class-validator';
import { PaginationQueryDto } from '../../../common/dto/pagination-query.dto';

export class QueryContactsDto extends PaginationQueryDto {
  @ApiPropertyOptional({ description: 'Matches contact name or email' })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  search?: string;
}
