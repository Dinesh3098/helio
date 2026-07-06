import { INestApplication } from "@nestjs/common";
import { randomUUID } from "node:crypto";
import request from "supertest";
import {
  authHeaders,
  createConversationFixture,
  createVisitorSession,
  sendVisitorMessage,
  signupOwner,
} from "./helpers/factories";
import { createTestApp } from "./helpers/test-app";

describe("conversations (integration)", () => {
  let app: INestApplication;

  beforeAll(async () => {
    app = await createTestApp();
  });

  afterAll(async () => {
    await app.close();
  });

  it("lists conversations with pagination and filters", async () => {
    const owner = await signupOwner(app);
    for (let i = 0; i < 3; i += 1) {
      const visitor = await createVisitorSession(app, owner.workspaceId);
      await sendVisitorMessage(app, visitor.visitorToken, `Question ${i}`);
    }

    const page1 = await request(app.getHttpServer())
      .get("/conversations")
      .query({ page: 1, limit: 2 })
      .set(authHeaders(owner.accessToken, owner.workspaceId))
      .expect(200);
    expect(page1.body.total).toBe(3);
    expect(page1.body.page).toBe(1);
    expect(page1.body.limit).toBe(2);
    expect(page1.body.data).toHaveLength(2);

    const row = page1.body.data[0];
    expect(row).toMatchObject({
      channel: "CHAT",
      status: "OPEN",
      priority: expect.any(String),
      assignedToUserId: null,
    });
    expect(row.id).toBeDefined();
    expect(row.contactId).toBeDefined();
    expect(row.contactName).toMatch(/^Visitor /);
    expect(row.lastMessagePreview).toMatch(/^Question /);

    const page2 = await request(app.getHttpServer())
      .get("/conversations")
      .query({ page: 2, limit: 2 })
      .set(authHeaders(owner.accessToken, owner.workspaceId))
      .expect(200);
    expect(page2.body.data).toHaveLength(1);
    const seen = new Set(
      [...page1.body.data, ...page2.body.data].map((c: { id: string }) => c.id),
    );
    expect(seen.size).toBe(3);

    // Default sort: newest activity first.
    const previews = [...page1.body.data, ...page2.body.data].map(
      (c: { lastMessagePreview: string }) => c.lastMessagePreview,
    );
    expect(previews).toEqual(["Question 2", "Question 1", "Question 0"]);

    // Status filter: nothing is resolved yet in this workspace.
    const resolved = await request(app.getHttpServer())
      .get("/conversations")
      .query({ status: "RESOLVED" })
      .set(authHeaders(owner.accessToken, owner.workspaceId))
      .expect(200);
    expect(resolved.body.total).toBe(0);

    // Invalid filter values are rejected by validation.
    await request(app.getHttpServer())
      .get("/conversations")
      .query({ status: "CLOSED" })
      .set(authHeaders(owner.accessToken, owner.workspaceId))
      .expect(400);
    await request(app.getHttpServer())
      .get("/conversations")
      .query({ limit: 0 })
      .set(authHeaders(owner.accessToken, owner.workspaceId))
      .expect(400);
  });

  it("returns conversation detail with contact, assignee, and counts", async () => {
    const { owner, conversationId } = await createConversationFixture(app);

    const res = await request(app.getHttpServer())
      .get(`/conversations/${conversationId}`)
      .set(authHeaders(owner.accessToken, owner.workspaceId))
      .expect(200);

    expect(res.body.id).toBe(conversationId);
    expect(res.body.status).toBe("OPEN");
    expect(res.body.lastMessagePreview).toBe("Hello from a test visitor");
    expect(res.body.messagesCount).toBe(1);
    expect(res.body.assignee).toBeNull();
    expect(res.body.aiSummary).toBeNull();
    expect(res.body.contact).toMatchObject({
      id: res.body.contactId,
      name: expect.stringMatching(/^Visitor /),
      email: null,
      phone: null,
    });
  });

  it("transitions status: resolve → reopen → snooze", async () => {
    const { owner, conversationId } = await createConversationFixture(app);
    const headers = authHeaders(owner.accessToken, owner.workspaceId);

    const resolved = await request(app.getHttpServer())
      .post(`/conversations/${conversationId}/resolve`)
      .set(headers)
      .expect(200);
    expect(resolved.body.status).toBe("RESOLVED");

    const reopened = await request(app.getHttpServer())
      .post(`/conversations/${conversationId}/reopen`)
      .set(headers)
      .expect(200);
    expect(reopened.body.status).toBe("OPEN");

    const snoozed = await request(app.getHttpServer())
      .post(`/conversations/${conversationId}/snooze`)
      .set(headers)
      .expect(200);
    expect(snoozed.body.status).toBe("SNOOZED");

    const detail = await request(app.getHttpServer())
      .get(`/conversations/${conversationId}`)
      .set(headers)
      .expect(200);
    expect(detail.body.status).toBe("SNOOZED");
  });

  it("updates status and priority via PATCH", async () => {
    const { owner, conversationId } = await createConversationFixture(app);
    const headers = authHeaders(owner.accessToken, owner.workspaceId);

    const both = await request(app.getHttpServer())
      .patch(`/conversations/${conversationId}`)
      .set(headers)
      .send({ status: "RESOLVED", priority: "HIGH" })
      .expect(200);
    expect(both.body.status).toBe("RESOLVED");
    expect(both.body.priority).toBe("HIGH");

    const priorityOnly = await request(app.getHttpServer())
      .patch(`/conversations/${conversationId}`)
      .set(headers)
      .send({ priority: "LOW" })
      .expect(200);
    expect(priorityOnly.body.priority).toBe("LOW");
    expect(priorityOnly.body.status).toBe("RESOLVED");
  });

  it("rejects invalid transition payloads with 400", async () => {
    const { owner, conversationId } = await createConversationFixture(app);
    const headers = authHeaders(owner.accessToken, owner.workspaceId);
    const url = `/conversations/${conversationId}`;

    await request(app.getHttpServer())
      .patch(url)
      .set(headers)
      .send({ status: "CLOSED" })
      .expect(400);
    await request(app.getHttpServer())
      .patch(url)
      .set(headers)
      .send({ priority: "URGENT" })
      .expect(400);
    // Non-whitelisted properties are forbidden by the global pipe.
    await request(app.getHttpServer())
      .patch(url)
      .set(headers)
      .send({ subject: "sneaky" })
      .expect(400);
    await request(app.getHttpServer())
      .post(`${url}/assign`)
      .set(headers)
      .send({ workspaceMemberId: "not-a-uuid" })
      .expect(400);
    // Non-uuid path param.
    await request(app.getHttpServer())
      .get("/conversations/not-a-uuid")
      .set(headers)
      .expect(400);
  });

  it("returns 404 for unknown or foreign-workspace conversations", async () => {
    const { owner, conversationId } = await createConversationFixture(app);
    const headers = authHeaders(owner.accessToken, owner.workspaceId);
    const missing = randomUUID();

    await request(app.getHttpServer())
      .get(`/conversations/${missing}`)
      .set(headers)
      .expect(404);
    await request(app.getHttpServer())
      .patch(`/conversations/${missing}`)
      .set(headers)
      .send({ priority: "HIGH" })
      .expect(404);
    await request(app.getHttpServer())
      .post(`/conversations/${missing}/resolve`)
      .set(headers)
      .expect(404);
    await request(app.getHttpServer())
      .post(`/conversations/${missing}/assign`)
      .set(headers)
      .send({})
      .expect(404);

    // Tenancy: another workspace's owner cannot see this conversation.
    const stranger = await signupOwner(app);
    await request(app.getHttpServer())
      .get(`/conversations/${conversationId}`)
      .set(authHeaders(stranger.accessToken, stranger.workspaceId))
      .expect(404);
  });

  it("assigns and unassigns a workspace member", async () => {
    const { owner, conversationId } = await createConversationFixture(app);
    const headers = authHeaders(owner.accessToken, owner.workspaceId);

    const members = await request(app.getHttpServer())
      .get("/workspace/members")
      .set(headers)
      .expect(200);
    expect(members.body).toHaveLength(1);
    const member = members.body[0];
    expect(member.userId).toBe(owner.userId);

    const assigned = await request(app.getHttpServer())
      .post(`/conversations/${conversationId}/assign`)
      .set(headers)
      .send({ workspaceMemberId: member.id })
      .expect(200);
    expect(assigned.body.assignedToUserId).toBe(owner.userId);

    const detail = await request(app.getHttpServer())
      .get(`/conversations/${conversationId}`)
      .set(headers)
      .expect(200);
    expect(detail.body.assignee).toMatchObject({
      userId: owner.userId,
      email: owner.email,
    });

    // Assignee filter surfaces the conversation.
    const filtered = await request(app.getHttpServer())
      .get("/conversations")
      .query({ assignedToUserId: owner.userId })
      .set(headers)
      .expect(200);
    expect(filtered.body.data.map((c: { id: string }) => c.id)).toContain(
      conversationId,
    );

    // Unknown member id → 404.
    await request(app.getHttpServer())
      .post(`/conversations/${conversationId}/assign`)
      .set(headers)
      .send({ workspaceMemberId: randomUUID() })
      .expect(404);

    // Empty body unassigns.
    const unassigned = await request(app.getHttpServer())
      .post(`/conversations/${conversationId}/assign`)
      .set(headers)
      .send({})
      .expect(200);
    expect(unassigned.body.assignedToUserId).toBeNull();
  });

  it("reopens a snoozed conversation when the visitor writes", async () => {
    const { owner, visitor, conversationId } =
      await createConversationFixture(app);
    const headers = authHeaders(owner.accessToken, owner.workspaceId);

    await request(app.getHttpServer())
      .post(`/conversations/${conversationId}/snooze`)
      .set(headers)
      .expect(200);

    const message = await sendVisitorMessage(
      app,
      visitor.visitorToken,
      "Are you still there?",
    );
    expect(message.conversationId).toBe(conversationId);

    const detail = await request(app.getHttpServer())
      .get(`/conversations/${conversationId}`)
      .set(headers)
      .expect(200);
    expect(detail.body.status).toBe("OPEN");
  });

  it("resolved conversations reject visitor messages; a new session starts fresh", async () => {
    const { owner, visitor, conversationId } =
      await createConversationFixture(app);
    const headers = authHeaders(owner.accessToken, owner.workspaceId);

    await request(app.getHttpServer())
      .post(`/conversations/${conversationId}/resolve`)
      .set(headers)
      .expect(200);

    // The old visitor token is pinned to the resolved conversation → 409.
    await request(app.getHttpServer())
      .post("/widget/messages")
      .set("Authorization", `Bearer ${visitor.visitorToken}`)
      .send({ content: "One more thing" })
      .expect(409);

    // Re-bootstrapping the session yields a brand-new conversation.
    const fresh = await createVisitorSession(
      app,
      owner.workspaceId,
      visitor.visitorId,
    );
    const followUp = await sendVisitorMessage(
      app,
      fresh.visitorToken,
      "One more thing",
    );
    expect(followUp.conversationId).not.toBe(conversationId);

    // The resolved thread stays resolved; the follow-up landed elsewhere.
    const oldDetail = await request(app.getHttpServer())
      .get(`/conversations/${conversationId}`)
      .set(headers)
      .expect(200);
    expect(oldDetail.body.status).toBe("RESOLVED");

    const newDetail = await request(app.getHttpServer())
      .get(`/conversations/${followUp.conversationId}`)
      .set(headers)
      .expect(200);
    expect(newDetail.body.status).toBe("OPEN");
    expect(newDetail.body.contactId).toBe(oldDetail.body.contactId);
  });

  it("requires authentication and a workspace context", async () => {
    const { conversationId } = await createConversationFixture(app);
    await request(app.getHttpServer()).get("/conversations").expect(401);
    await request(app.getHttpServer())
      .get(`/conversations/${conversationId}`)
      .expect(401);
  });
});
