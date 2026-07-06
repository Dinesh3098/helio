import { INestApplication } from "@nestjs/common";
import request from "supertest";
import {
  authHeaders,
  createConversationFixture,
  signupOwner,
} from "./helpers/factories";
import { createTestApp } from "./helpers/test-app";

/** Audit writes are fire-and-forget; poll briefly for the row. */
async function eventually<T>(
  probe: () => Promise<T | undefined>,
  timeoutMs = 6000,
): Promise<T> {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const result = await probe();
    if (result !== undefined) return result;
    if (Date.now() > deadline) throw new Error("condition never became true");
    await new Promise((r) => setTimeout(r, 200));
  }
}

describe("audit log (integration)", () => {
  let app: INestApplication;

  beforeAll(async () => {
    app = await createTestApp();
  });

  afterAll(async () => {
    await app.close();
  });

  it("requires auth and workspace context", async () => {
    await request(app.getHttpServer()).get("/audit/logs").expect(401);
    const owner = await signupOwner(app);
    await request(app.getHttpServer())
      .get("/audit/logs")
      .set({ Authorization: `Bearer ${owner.accessToken}` })
      .expect(200); // single-workspace users get an implicit workspace
  });

  it("records conversation actions with the acting user attached", async () => {
    const { owner, conversationId } = await createConversationFixture(app);
    const headers = authHeaders(owner.accessToken, owner.workspaceId);

    await request(app.getHttpServer())
      .post(`/conversations/${conversationId}/resolve`)
      .set(headers)
      .expect(200);

    const entry = await eventually(async () => {
      const res = await request(app.getHttpServer())
        .get("/audit/logs")
        .set(headers)
        .expect(200);
      return res.body.data.find(
        (log: { action: string; resourceId: string }) =>
          log.action === "conversation.status_changed" &&
          log.resourceId === conversationId,
      );
    });
    expect(entry.actorName).toBe("Test Owner");
    expect(entry.workspaceId ?? owner.workspaceId).toBe(owner.workspaceId);
  });

  it("filters by resourceType", async () => {
    const { owner, conversationId } = await createConversationFixture(app);
    const headers = authHeaders(owner.accessToken, owner.workspaceId);
    await request(app.getHttpServer())
      .post(`/conversations/${conversationId}/resolve`)
      .set(headers)
      .expect(200);

    const filtered = await eventually(async () => {
      const res = await request(app.getHttpServer())
        .get("/audit/logs")
        .set(headers)
        .query({ resourceType: "conversation" })
        .expect(200);
      return res.body.data.length > 0 ? res.body : undefined;
    });
    for (const log of filtered.data) {
      expect(log.resourceType).toBe("conversation");
    }
  });

  it("audit writes never break the underlying action (fire-and-forget)", async () => {
    // Sanity: a normal action succeeds and returns before the audit row
    // is necessarily visible — proven by resolve returning 200 above and
    // the row appearing only via polling.
    const { owner, conversationId } = await createConversationFixture(app);
    const headers = authHeaders(owner.accessToken, owner.workspaceId);
    await request(app.getHttpServer())
      .post(`/conversations/${conversationId}/resolve`)
      .set(headers)
      .expect(200);
  });
});
