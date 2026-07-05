import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { WorkspaceMember, WorkspaceMemberRole } from '../../database/entities';
import { WorkspaceMembersService } from '../../modules/workspace-members/workspace-members.service';
import { AuthenticatedUser } from '../interfaces/authenticated-user.interface';
import { ROLES_KEY } from '../decorators/roles.decorator';

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

interface RequestWithAuth {
  user?: AuthenticatedUser;
  params: Record<string, string | undefined>;
  headers: Record<string, string | string[] | undefined>;
  workspaceMembership?: WorkspaceMember;
}

/**
 * Workspace-scoped RBAC. Resolves the workspace from the :workspaceId route
 * param (or x-workspace-id header), loads the caller's membership from the
 * database on every request, and compares it to @Roles() metadata. Runs
 * after JwtAuthGuard. The membership is attached to the request so handlers
 * don't query it twice.
 */
@Injectable()
export class RolesGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly workspaceMembersService: WorkspaceMembersService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const requiredRoles = this.reflector.getAllAndOverride<
      WorkspaceMemberRole[] | undefined
    >(ROLES_KEY, [context.getHandler(), context.getClass()]);
    if (!requiredRoles || requiredRoles.length === 0) {
      return true;
    }

    const request = context.switchToHttp().getRequest<RequestWithAuth>();
    const user = request.user;
    if (!user) {
      throw new UnauthorizedException();
    }

    const headerValue = request.headers['x-workspace-id'];
    const workspaceId =
      request.params.workspaceId ??
      (Array.isArray(headerValue) ? headerValue[0] : headerValue);

    let membership: WorkspaceMember | null;
    if (workspaceId) {
      if (!UUID_PATTERN.test(workspaceId)) {
        throw new ForbiddenException('Workspace context is required');
      }
      membership = await this.workspaceMembersService.findMembership(
        workspaceId,
        user.id,
      );
    } else {
      // No explicit workspace: fall back to the user's sole membership.
      // With several workspaces the caller must disambiguate — guessing
      // would be a tenant-isolation hazard.
      const memberships = await this.workspaceMembersService.findByUser(
        user.id,
      );
      if (memberships.length !== 1) {
        throw new ForbiddenException(
          'Workspace context is required — send the x-workspace-id header',
        );
      }
      membership = memberships[0] ?? null;
    }
    if (!membership || !requiredRoles.includes(membership.role)) {
      throw new ForbiddenException('Insufficient workspace permissions');
    }

    request.workspaceMembership = membership;
    return true;
  }
}
