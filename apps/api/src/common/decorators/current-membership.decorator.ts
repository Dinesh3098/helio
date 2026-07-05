import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { WorkspaceMember } from '../../database/entities';

/**
 * Returns the workspace membership RolesGuard resolved and attached to the
 * request. Only valid on handlers guarded by RolesGuard with @Roles().
 */
export const CurrentMembership = createParamDecorator(
  (_data: unknown, context: ExecutionContext): WorkspaceMember => {
    const request = context
      .switchToHttp()
      .getRequest<{ workspaceMembership: WorkspaceMember }>();
    return request.workspaceMembership;
  },
);
