import { INestApplication } from "@nestjs/common";
import { randomUUID } from "node:crypto";
import request from "supertest";
import {
  authHeaders,
  createConversationFixture,
  signupOwner,
} from "./helpers/factories";
import { createTestApp } from "./helpers/test-app";

interface TimelineEntry {
  kind: "message" | "event";
  at: string;
  message?: { id: string; content: string; senderType: string };
  event?: {
    id: string;
    action: string;
    actorName: string | null;
    metadata: Record<string, unknown> | null;
    createdAt: string;
  };
}

describe("conversation timeline (integration)", () => {
  let app: INestApplication;

  beforeAll(async () => {
    app = await createTestApp();
  });

  afterAll(async () => {
    await app.close();
  });

  /**
   * Audit writes are fire-and-forget (they must never fail the action they
   * describe), so the event half of the timeline is eventually consistent.
   * Poll briefly until the expected actions are all present.
   */
  async function fetchTimelineUntil(
    headers: Record<string, string>,
    conversationId: string,
    expectedActions: string[],
  ): Promise<TimelineEntry[]> {
    let entries: TimelineEntry[] = [];
    for (let attempt = 0; attempt < 40; attempt += 1) {
      const res = await request(app.getHttpServer())
        .get(`/conversations/${conversationId}/timeline`)
        .set(headers)
        .expect(200);
      entries = res.body.entries as TimelineEntry[];
      const actions = entries
        .filter((e) => e.kind === "event")
        .map((e) => e.event?.action);
      if (expectedActions.every((action) => actions.includes(action))) {
        return entries;
      }
      await new Promise((resolve) => setTimeout(resolve, 250));
    }
    return entries;
  }

  it("records creation, message, assignment, priority, and status events", async () => {
    const { owner, conversationId } = await createConversationFixture(app);
    const headers = authHeaders(owner.accessToken, owner.workspaceId);

    // Assignment → priority change → resolve, each of which audits.
    const members = await request(app.getHttpServer())
      .get("/workspace/members")
      .set(headers)
      .expect(200);
    await request(app.getHttpServer())
      .post(`/conversations/${conversationId}/assign`)
      .set(headers)
      .send({ workspaceMemberId: members.body[0].id })
      .expect(200);
    await request(app.getHttpServer())
      .patch(`/conversations/${conversationId}`)
      .set(headers)
      .send({ priority: "HIGH" })
      .expect(200);
    await request(app.getHttpServer())
      .post(`/conversations/${conversationId}/resolve`)
      .set(headers)
      .expect(200);

    const entries = await fetchTimelineUntil(headers, conversationId, [
      "conversation.created",
      "conversation.assigned",
      "conversation.priority_changed",
      "conversation.status_changed",
    ]);

    const events = entries.filter((e) => e.kind === "event");
    const messages = entries.filter((e) => e.kind === "message");
    const byAction = (action: string) =>
      events.find((e) => e.event?.action === action)?.event;

    // The visitor's message is interleaved as a message entry.
    expect(messages.length).toBeGreaterThanOrEqual(1);
    expect(messages[0]?.message).toMatchObject({
      content: "Hello from a test visitor",
      senderType: "CONTACT",
    });

    // Widget-created conversation: system event, no actor.
    const created = byAction("conversation.created");
    expect(created).toBeDefined();
    expect(created?.actorName).toBeNull();
    expect(created?.metadata).toMatchObject({ source: "widget" });

    // Assignment carries the assignee and the acting agent.
    const assigned = byAction("conversation.assigned");
    expect(assigned).toBeDefined();
    expect(assigned?.actorName).toBe("Test Owner");
    expect(assigned?.metadata).toMatchObject({
      assignedToUserId: owner.userId,
    });

    // Priority and status changes record from → to.
    expect(byAction("conversation.priority_changed")?.metadata).toMatchObject({
      from: "MEDIUM",
      to: "HIGH",
    });
    const statusChanged = byAction("conversation.status_changed");
    expect(statusChanged?.actorName).toBe("Test Owner");
    expect(statusChanged?.metadata).toMatchObject({
      from: "OPEN",
      to: "RESOLVED",
    });

    // Entries are interleaved chronologically (ascending).
    const stamps = entries.map((e) => new Date(e.at).getTime());
    expect([...stamps].sort((a, b) => a - b)).toEqual(stamps);
  });

  it("does not duplicate events for no-op updates", async () => {
    const { owner, conversationId } = await createConversationFixture(app);
    const headers = authHeaders(owner.accessToken, owner.workspaceId);

    await request(app.getHttpServer())
      .post(`/conversations/${conversationId}/resolve`)
      .set(headers)
      .expect(200);
    // Resolving an already-resolved conversation changes nothing.
    await request(app.getHttpServer())
      .post(`/conversations/${conversationId}/resolve`)
      .set(headers)
      .expect(200);

    const entries = await fetchTimelineUntil(headers, conversationId, [
      "conversation.status_changed",
    ]);
    // Give any stray second write a moment to land before counting.
    await new Promise((resolve) => setTimeout(resolve, 500));

    const res = await request(app.getHttpServer())
      .get(`/conversations/${conversationId}/timeline`)
      .set(headers)
      .expect(200);
    const statusEvents = (res.body.entries as TimelineEntry[]).filter(
      (e) => e.event?.action === "conversation.status_changed",
    );
    expect(entries.length).toBeGreaterThan(0);
    expect(statusEvents).toHaveLength(1);
  });

  it("returns 404 for unknown or foreign conversations and 401 without auth", async () => {
    const { owner, conversationId } = await createConversationFixture(app);
    const headers = authHeaders(owner.accessToken, owner.workspaceId);

    await request(app.getHttpServer())
      .get(`/conversations/${randomUUID()}/timeline`)
      .set(headers)
      .expect(404);

    const stranger = await signupOwner(app);
    await request(app.getHttpServer())
      .get(`/conversations/${conversationId}/timeline`)
      .set(authHeaders(stranger.accessToken, stranger.workspaceId))
      .expect(404);

    await request(app.getHttpServer())
      .get(`/conversations/${conversationId}/timeline`)
      .expect(401);
  });
});
