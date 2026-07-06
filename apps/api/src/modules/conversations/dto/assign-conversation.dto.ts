import { ApiPropertyOptional } from "@nestjs/swagger";
import { IsOptional, IsUUID } from "class-validator";

export class AssignConversationDto {
  @ApiPropertyOptional({
    format: "uuid",
    nullable: true,
    description: "Workspace member to assign; omit or null to unassign",
  })
  @IsOptional()
  @IsUUID()
  workspaceMemberId?: string | null;
}
