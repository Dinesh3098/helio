import { ApiProperty } from "@nestjs/swagger";
import { IsEmail, IsIn, MaxLength } from "class-validator";
import { WorkspaceMemberRole } from "../../../database/entities";

// OWNER is deliberately absent — ownership is never granted through
// invites, which also guarantees a workspace has exactly one owner.
const INVITABLE_ROLES = [
  WorkspaceMemberRole.ADMIN,
  WorkspaceMemberRole.AGENT,
] as const;

export class InviteMemberDto {
  @ApiProperty({ example: "agent@example.com" })
  @IsEmail()
  @MaxLength(255)
  email: string;

  @ApiProperty({ enum: INVITABLE_ROLES, example: WorkspaceMemberRole.AGENT })
  @IsIn(INVITABLE_ROLES)
  role: WorkspaceMemberRole;
}
