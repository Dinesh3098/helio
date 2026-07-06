import { ApiProperty } from "@nestjs/swagger";
import { IsUUID } from "class-validator";

export class CreateWidgetSessionDto {
  @ApiProperty({
    format: "uuid",
    description: "Workspace embedding the widget",
  })
  @IsUUID()
  workspaceId: string;

  @ApiProperty({
    format: "uuid",
    description:
      "Stable anonymous id minted by the widget and stored in localStorage",
  })
  @IsUUID()
  visitorId: string;
}
