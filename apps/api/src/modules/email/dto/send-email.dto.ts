import { ApiProperty } from "@nestjs/swagger";
import { Transform } from "class-transformer";
import { IsNotEmpty, IsString, MaxLength } from "class-validator";

export class SendEmailReplyDto {
  @ApiProperty({ description: "Plain-text reply body", maxLength: 10_000 })
  @Transform(({ value }) =>
    typeof value === "string" ? value.trim() : (value as unknown),
  )
  @IsString()
  @IsNotEmpty({ message: "Reply content cannot be empty" })
  @MaxLength(10_000)
  content: string;
}
