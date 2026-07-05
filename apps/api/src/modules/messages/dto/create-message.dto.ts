import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsNotEmpty, IsString, MaxLength } from 'class-validator';

export class CreateMessageDto {
  @ApiProperty({ example: 'Hello! How can I help?', maxLength: 10_000 })
  @Transform(({ value }) =>
    typeof value === 'string' ? value.trim() : (value as unknown),
  )
  @IsString()
  @IsNotEmpty({ message: 'Message content cannot be empty' })
  @MaxLength(10_000, { message: 'Message content is too long' })
  content: string;
}
