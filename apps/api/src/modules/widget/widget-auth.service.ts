import { Injectable } from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import { VisitorPrincipal } from "./interfaces/visitor-principal.interface";

interface VisitorTokenPayload {
  sub: string;
  typ: "visitor";
  wid: string;
  cid: string;
  name: string;
}

/** Sessions outlive page reloads via localStorage-driven re-issuance. */
const VISITOR_TOKEN_TTL = "24h";

/**
 * Visitor tokens share the platform JWT secret but carry `typ: 'visitor'`
 * and a contact id as subject, so they are inert against agent endpoints
 * (JwtStrategy resolves sub against users and finds nothing) and agent
 * tokens are inert here (no typ claim).
 */
@Injectable()
export class WidgetAuthService {
  constructor(private readonly jwtService: JwtService) {}

  async signVisitorToken(principal: VisitorPrincipal): Promise<string> {
    const payload: VisitorTokenPayload = {
      sub: principal.contactId,
      typ: "visitor",
      wid: principal.workspaceId,
      cid: principal.conversationId,
      name: principal.name,
    };
    return this.jwtService.signAsync(payload, {
      expiresIn: VISITOR_TOKEN_TTL,
    });
  }

  async verifyVisitorToken(token: string): Promise<VisitorPrincipal | null> {
    try {
      const payload =
        await this.jwtService.verifyAsync<VisitorTokenPayload>(token);
      if (payload.typ !== "visitor") return null;
      return {
        contactId: payload.sub,
        workspaceId: payload.wid,
        conversationId: payload.cid,
        name: payload.name,
      };
    } catch {
      return null;
    }
  }
}
