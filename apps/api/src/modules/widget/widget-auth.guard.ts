import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from "@nestjs/common";
import type { Request } from "express";
import { VisitorPrincipal } from "./interfaces/visitor-principal.interface";
import { WidgetAuthService } from "./widget-auth.service";

export type WidgetRequest = Request & { visitor: VisitorPrincipal };

@Injectable()
export class WidgetAuthGuard implements CanActivate {
  constructor(private readonly widgetAuthService: WidgetAuthService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<WidgetRequest>();
    const header = request.headers.authorization;
    const token = header?.startsWith("Bearer ") ? header.slice(7) : undefined;

    const visitor = token
      ? await this.widgetAuthService.verifyVisitorToken(token)
      : null;
    if (!visitor) {
      throw new UnauthorizedException("Invalid or expired visitor token");
    }

    request.visitor = visitor;
    return true;
  }
}
