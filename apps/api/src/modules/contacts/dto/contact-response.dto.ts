import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class ContactResponseDto {
  @ApiProperty({ format: 'uuid' })
  id: string;

  @ApiProperty()
  name: string;

  @ApiPropertyOptional({ nullable: true })
  email: string | null;

  @ApiPropertyOptional({ nullable: true })
  phone: string | null;

  @ApiProperty()
  createdAt: Date;

  @ApiProperty()
  updatedAt: Date;
}

export class ContactDetailResponseDto extends ContactResponseDto {
  @ApiProperty({ description: 'Total conversations with this contact' })
  totalConversations: number;

  @ApiProperty({ description: 'Conversations currently OPEN' })
  openConversations: number;

  @ApiPropertyOptional({ nullable: true, description: 'Latest activity' })
  lastConversationAt: Date | null;
}

export class PaginatedContactsDto {
  @ApiProperty({ type: ContactResponseDto, isArray: true })
  data: ContactResponseDto[];

  @ApiProperty()
  total: number;

  @ApiProperty()
  page: number;

  @ApiProperty()
  limit: number;
}
