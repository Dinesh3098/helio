import { INestApplication } from "@nestjs/common";
import request from "supertest";
import type { Socket } from "socket.io-client";
import { randomUUID } from "node:crypto";
import {
  authHeaders,
  createVisitorSession,
  sendVisitorMessage,
  signupOwner,
} from "./helpers/factories";
import { connectSocket } from "./helpers/socket";
import { createListeningTestApp } from "./helpers/test-app";

jest.setTimeout(120_000);

/**
 * Smoke tests, not benchmarks: prove the platform survives realistic
 * concurrency without errors. Assertions are on success/failure counts
 * and generous wall-clock ceilings — never on latency percentiles.
 */
describe("performance smoke (integration)", () => {
  let app: INestApplication;
  let baseUrl: string;

  beforeAll(async () => {
    ({ app, baseUrl } = await createListeningTestApp());
  });

  afterAll(async () => {
    await app.close();
  });

  it("creates 100 concurrent widget sessions", async () => {
    const owner = await signupOwner(app);
    const started = Date.now();

    const results = await Promise.allSettled(
      Array.from({ length: 100 }, () =>
        request(app.getHttpServer())
          .post("/widget/session")
          .send({ workspaceId: owner.workspaceId, visitorId: randomUUID() })
          .expect(200),
      ),
    );

    const failed = results.filter((r) => r.status === "rejected");
    expect(failed).toHaveLength(0);
    expect(Date.now() - started).toBeLessThan(60_000);
  });

  it("holds 100 concurrent socket connections and disconnects cleanly", async () => {
    const owner = await signupOwner(app);
    const visitors = await Promise.all(
      Array.from({ length: 100 }, () =>
        createVisitorSession(app, owner.workspaceId),
      ),
    );

    const sockets: Socket[] = await Promise.all(
      visitors.map((visitor) =>
        connectSocket(baseUrl, { visitorToken: visitor.visitorToken }, 15_000),
      ),
    );

    try {
      expect(sockets.filter((s) => s.connected)).toHaveLength(100);
    } finally {
      for (const socket of sockets) socket.disconnect();
    }
  });

  it("burst REST message sending stays ordered and lossless", async () => {
    const owner = await signupOwner(app);
    const visitor = await createVisitorSession(app, owner.workspaceId);
    const first = await sendVisitorMessage(app, visitor.visitorToken, "seed");

    // Sequential burst: REST has no per-visitor throttle, and sequencing
    // lets us assert strict ordering by creation.
    const contents = Array.from({ length: 20 }, (_, i) => `burst-${i}`);
    for (const content of contents) {
      await request(app.getHttpServer())
        .post("/widget/messages")
        .set("Authorization", `Bearer ${visitor.visitorToken}`)
        .send({ content })
        .expect(201);
    }

    const page = await request(app.getHttpServer())
      .get(`/conversations/${first.conversationId}/messages`)
      .set(authHeaders(owner.accessToken, owner.workspaceId))
      .query({ limit: 50 })
      .expect(200);

    const received = page.body.data
      .map((m: { content: string }) => m.content)
      .filter((c: string) => c.startsWith("burst-"));
    expect(received).toEqual(contents);
  });

  it("AI rate limiting kicks in under a burst (mocked provider)", async () => {
    const owner = await signupOwner(app);
    const visitor = await createVisitorSession(app, owner.workspaceId);
    const { conversationId } = await sendVisitorMessage(
      app,
      visitor.visitorToken,
      "need help with my order",
    );

    // Nothing must reach Gemini: every call the guard admits gets a
    // canned success response.
    const fetchSpy = jest.spyOn(global, "fetch").mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        candidates: [{ content: { parts: [{ text: "mock summary" }] } }],
      }),
    } as unknown as Response);

    try {
      // Guard allows 30 requests / 300s per user (ai-rate-limit.guard.ts);
      // 35 sequential calls must produce at least one 429.
      const statuses: number[] = [];
      for (let i = 0; i < 35; i++) {
        const res = await request(app.getHttpServer())
          .post(`/ai/conversations/${conversationId}/summary`)
          .set(authHeaders(owner.accessToken, owner.workspaceId));
        statuses.push(res.status);
      }
      const ok = statuses.filter((s) => s < 400).length;
      const limited = statuses.filter((s) => s === 429).length;
      expect(ok).toBeGreaterThan(0);
      expect(limited).toBeGreaterThanOrEqual(5);
      expect(ok + limited).toBe(35);
    } finally {
      fetchSpy.mockRestore();
    }
  });

  it("email webhook burst: 20 inbound emails all land", async () => {
    const owner = await signupOwner(app);
    const mailbox = `support-${randomUUID().slice(0, 8)}@test.helio.dev`;
    await request(app.getHttpServer())
      .post("/email/accounts")
      .set(authHeaders(owner.accessToken, owner.workspaceId))
      .send({ email: mailbox })
      .expect(201);

    const results = await Promise.allSettled(
      Array.from({ length: 20 }, (_, i) =>
        request(app.getHttpServer())
          .post("/email/webhook")
          .send({
            from: `customer-${i}@example.com`,
            to: mailbox,
            subject: `Bulk inbound ${i}`,
            messageId: `<bulk-${i}-${randomUUID()}@example.com>`,
            text: `email body ${i}`,
          })
          .expect(200),
      ),
    );
    expect(results.filter((r) => r.status === "rejected")).toHaveLength(0);

    const conversations = await request(app.getHttpServer())
      .get("/conversations")
      .set(authHeaders(owner.accessToken, owner.workspaceId))
      .query({ limit: 50 })
      .expect(200);
    const emailConvos = conversations.body.data.filter(
      (c: { channel: string }) => c.channel === "EMAIL",
    );
    expect(emailConvos.length).toBe(20);
  });
});
