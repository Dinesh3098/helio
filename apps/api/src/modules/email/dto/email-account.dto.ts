import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import {
  IsBoolean,
  IsEmail,
  IsIn,
  IsOptional,
  IsString,
  Length,
  MaxLength,
} from 'class-validator';

export const ACCOUNT_STATUSES = ['ACTIVE', 'DISABLED'] as const;

export class CreateEmailAccountDto {
  @ApiProperty({ example: 'support@acme.com' })
  @IsEmail()
  @MaxLength(255)
  email: string;

  @ApiPropertyOptional({ example: 'Acme Support' })
  @IsOptional()
  @IsString()
  @Length(1, 255)
  displayName?: string;
}

export class UpdateEmailAccountDto extends PartialType(
  CreateEmailAccountDto,
) {
  @ApiPropertyOptional({
    description: 'Mark the address verified (domain ownership confirmed)',
  })
  @IsOptional()
  @IsBoolean()
  isVerified?: boolean;

  @ApiPropertyOptional({ enum: ACCOUNT_STATUSES })
  @IsOptional()
  @IsIn(ACCOUNT_STATUSES)
  status?: (typeof ACCOUNT_STATUSES)[number];
}

export class EmailAccountResponseDto {
  @ApiProperty({ format: 'uuid' })
  id: string;

  @ApiProperty()
  email: string;

  @ApiPropertyOptional({ nullable: true })
  displayName: string | null;

  @ApiProperty({ example: 'RESEND' })
  provider: string;

  @ApiProperty()
  isVerified: boolean;

  @ApiProperty({ enum: ACCOUNT_STATUSES })
  status: string;

  @ApiProperty()
  createdAt: Date;

  @ApiProperty()
  updatedAt: Date;
}
