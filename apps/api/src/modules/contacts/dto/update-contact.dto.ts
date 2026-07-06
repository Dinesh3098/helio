import { ApiPropertyOptional } from "@nestjs/swagger";
import {
  IsEmail,
  IsOptional,
  IsString,
  Length,
  MaxLength,
} from "class-validator";

export class UpdateContactDto {
  @ApiPropertyOptional({ example: "John Customer" })
  @IsOptional()
  @IsString()
  @Length(1, 255)
  name?: string;

  @ApiPropertyOptional({ example: "john@customer.com" })
  @IsOptional()
  @IsEmail()
  @MaxLength(255)
  email?: string;

  @ApiPropertyOptional({ example: "+91 98765 43210" })
  @IsOptional()
  @IsString()
  @MaxLength(50)
  phone?: string;
}
