import { ApiProperty } from "@nestjs/swagger";
import { IsString, Length } from "class-validator";

export class UpdateWorkspaceDto {
  @ApiProperty({ example: "Acme Support", minLength: 1, maxLength: 255 })
  @IsString()
  @Length(1, 255)
  name: string;
}
