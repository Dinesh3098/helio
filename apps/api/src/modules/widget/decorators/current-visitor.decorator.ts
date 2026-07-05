import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import type { VisitorPrincipal } from '../interfaces/visitor-principal.interface';
import type { WidgetRequest } from '../widget-auth.guard';

export const CurrentVisitor = createParamDecorator(
  (_data: unknown, context: ExecutionContext): VisitorPrincipal =>
    context.switchToHttp().getRequest<WidgetRequest>().visitor,
);
