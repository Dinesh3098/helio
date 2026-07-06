import { JwtService } from "@nestjs/jwt";
import { VisitorPrincipal } from "./interfaces/visitor-principal.interface";
import { WidgetAuthService } from "./widget-auth.service";

describe("WidgetAuthService", () => {
  const jwtService = new JwtService({ secret: "unit-test-secret" });
  const service = new WidgetAuthService(jwtService);

  const principal: VisitorPrincipal = {
    contactId: "contact-1",
    workspaceId: "ws-1",
    conversationId: "conv-1",
    name: "Jane Visitor",
  };

  it("round-trips a signed visitor token back to the same principal", async () => {
    const token = await service.signVisitorToken(principal);
    await expect(service.verifyVisitorToken(token)).resolves.toEqual(principal);
  });

  it("binds the token to workspace, contact, and conversation via claims", async () => {
    const token = await service.signVisitorToken(principal);
    const claims = jwtService.decode<Record<string, unknown>>(token);
    expect(claims).toMatchObject({
      sub: "contact-1",
      typ: "visitor",
      wid: "ws-1",
      cid: "conv-1",
      name: "Jane Visitor",
    });
    // 24h TTL: exp claim is present and in the future.
    expect(typeof claims.exp).toBe("number");
    expect(claims.exp as number).toBeGreaterThan(Date.now() / 1000);
  });

  it("returns null for garbage tokens instead of throwing", async () => {
    await expect(service.verifyVisitorToken("not-a-jwt")).resolves.toBeNull();
    await expect(service.verifyVisitorToken("")).resolves.toBeNull();
  });

  it("returns null for expired tokens", async () => {
    const expired = await jwtService.signAsync(
      {
        sub: principal.contactId,
        typ: "visitor",
        wid: principal.workspaceId,
        cid: principal.conversationId,
        name: principal.name,
      },
      { expiresIn: "-1s" },
    );
    await expect(service.verifyVisitorToken(expired)).resolves.toBeNull();
  });

  it("rejects tokens signed with a different secret", async () => {
    const foreign = await new JwtService({ secret: "other-secret" }).signAsync({
      sub: "contact-1",
      typ: "visitor",
      wid: "ws-1",
      cid: "conv-1",
      name: "Jane",
    });
    await expect(service.verifyVisitorToken(foreign)).resolves.toBeNull();
  });

  it("rejects agent-shaped tokens missing the visitor typ claim", async () => {
    const agentToken = await jwtService.signAsync({
      sub: "user-1",
      email: "agent@example.com",
    });
    await expect(service.verifyVisitorToken(agentToken)).resolves.toBeNull();
  });
});
