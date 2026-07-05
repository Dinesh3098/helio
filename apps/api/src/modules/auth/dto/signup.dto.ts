import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, IsString, Length, MaxLength, MinLength } from 'class-validator';

export class SignupDto {
  @ApiProperty({ example: 'Jane Doe' })
  @IsString()
  @Length(1, 255)
  name: string;

  @ApiProperty({ example: 'jane@acme.com' })
  @IsEmail()
  @MaxLength(255)
  email: string;

  // bcrypt truncates inputs beyond 72 bytes, hence the max.
  @ApiProperty({ minLength: 8, maxLength: 72 })
  @IsString()
  @MinLength(8)
  @MaxLength(72)
  password: string;

  @ApiProperty({ example: 'Acme Inc' })
  @IsString()
  @Length(1, 255)
  workspaceName: string;
}
