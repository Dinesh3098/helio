import { SetMetadata } from "@nestjs/common";
import { WorkspaceMemberRole } from "../../database/entities";

export const ROLES_KEY = "roles";

/**
 * Declares which workspace roles may hit a handler. Enforced by RolesGuard
 * via a live workspace_members lookup — roles are never read from the JWT.
 */
export const Roles = (...roles: WorkspaceMemberRole[]) =>
  SetMetadata(ROLES_KEY, roles);
