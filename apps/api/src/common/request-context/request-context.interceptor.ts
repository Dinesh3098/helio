import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import type { AuthenticatedUser } from '../interfaces/authenticated-user.interface';
import { WorkspaceMember } from '../../database/entities';
import { RequestContextService } from './request-context.service';

/**
 * Runs after the guards (interceptors always do), so request.user and the
 * resolved workspace membership exist — copies them into the ALS store
 * where AuditService and future consumers pick them up implicitly.
 */
@Injectable()
export class RequestContextInterceptor implements NestInterceptor {
  constructor(private readonly requestContext: RequestContextService) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const request = context.switchToHttp().getRequest<{
      user?: AuthenticatedUser;
      workspaceMembership?: WorkspaceMember;
    }>();
    this.requestContext.assign({
      userId: request.user?.id,
      workspaceId: request.workspaceMembership?.workspaceId,
    });
    return next.handle();
  }
}
