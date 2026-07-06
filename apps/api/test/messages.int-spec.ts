import { INestApplication } from "@nestjs/common";
import { randomUUID } from "node:crypto";
import request from "supertest";
import {
  authHeaders,
  createConversationFixture,
  sendVisitorMessage,
} from "./helpers/factories";
import { createTestApp } from "./helpers/test-app";

describe("messages (integration)", () => {
  let app: INestApplication;

  beforeAll(async () => {
    app = await createTestApp();
  });

  afterAll(async () => {
    await app.close();
  });

  it("agent sends a message into a conversation", async () => {
    const { owner, conversationId } = await createConversationFixture(app);
    const headers = authHeaders(owner.accessToken, owner.workspaceId);

    const res = await request(app.getHttpServer())
      .post(`/conversations/${conversationId}/messages`)
      .set(headers)
      .send({ content: "Hi! How can I help you today?" })
      .expect(201);

    expect(res.body).toMatchObject({
      conversationId,
      senderType: "USER",
      senderId: owner.userId,
      senderName: "Test Owner",
      content: "Hi! How can I help you today?",
      messageType: "TEXT",
    });
    expect(res.body.id).toBeDefined();
    expect(res.body.createdAt).toBeDefined();
    // The message DTO does not expose read state.
    expect(res.body).not.toHaveProperty("isRead");

    // The conversation's denormalized preview follows the newest message.
    const detail = await request(app.getHttpServer())
      .get(`/conversations/${conversationId}`)
      .set(headers)
      .expect(200);
    expect(detail.body.lastMessagePreview).toBe(
      "Hi! How can I help you today?",
    );
    expect(detail.body.messagesCount).toBe(2);
  });

  it("visitor messages appear in the agent view with the contact name", async () => {
    const { owner, conversationId } = await createConversationFixture(app);

    const res = await request(app.getHttpServer())
      .get(`/conversations/${conversationId}/messages`)
      .set(authHeaders(owner.accessToken, owner.workspaceId))
      .expect(200);

    expect(res.body.data).toHaveLength(1);
    expect(res.body.nextCursor).toBeNull();
    expect(res.body.data[0]).toMatchObject({
      conversationId,
      senderType: "CONTACT",
      senderName: expect.stringMatching(/^Visitor /),
      content: "Hello from a test visitor",
    });
  });

  it("agent replies are visible to the visitor via the widget", async () => {
    const { owner, visitor, conversationId } =
      await createConversationFixture(app);

    await request(app.getHttpServer())
      .post(`/conversations/${conversationId}/messages`)
      .set(authHeaders(owner.accessToken, owner.workspaceId))
      .send({ content: "An agent reply" })
      .expect(201);

    const res = await request(app.getHttpServer())
      .get("/widget/messages")
      .set("Authorization", `Bearer ${visitor.visitorToken}`)
      .expect(200);
    const contents = res.body.data.map((m: { content: string }) => m.content);
    expect(contents).toEqual(["Hello from a test visitor", "An agent reply"]);
  });

  it("paginates with a keyset cursor, oldest→newest per page", async () => {
    const { owner, conversationId } = await createConversationFixture(app);
    const headers = authHeaders(owner.accessToken, owner.workspaceId);

    for (let i = 1; i <= 5; i += 1) {
      await request(app.getHttpServer())
        .post(`/conversations/${conversationId}/messages`)
        .set(headers)
        .send({ content: `Agent message ${i}` })
        .expect(201);
    }

    // Newest page first (3 of 6 total).
    const page1 = await request(app.getHttpServer())
      .get(`/conversations/${conversationId}/messages`)
      .query({ limit: 3 })
      .set(headers)
      .expect(200);
    expect(page1.body.data.map((m: { content: string }) => m.content)).toEqual([
      "Agent message 3",
      "Agent message 4",
      "Agent message 5",
    ]);
    expect(page1.body.nextCursor).toEqual(expect.any(String));

    // The cursor walks toward older messages; the final page has no cursor.
    const page2 = await request(app.getHttpServer())
      .get(`/conversations/${conversationId}/messages`)
      .query({ limit: 3, cursor: page1.body.nextCursor })
      .set(headers)
      .expect(200);
    expect(page2.body.data.map((m: { content: string }) => m.content)).toEqual([
      "Hello from a test visitor",
      "Agent message 1",
      "Agent message 2",
    ]);
    expect(page2.body.nextCursor).toBeNull();
  });

  it("rejects malformed cursors and invalid limits", async () => {
    const { owner, conversationId } = await createConversationFixture(app);
    const headers = authHeaders(owner.accessToken, owner.workspaceId);

    await request(app.getHttpServer())
      .get(`/conversations/${conversationId}/messages`)
      .query({ cursor: "definitely-not-a-cursor" })
      .set(headers)
      .expect(400);
    await request(app.getHttpServer())
      .get(`/conversations/${conversationId}/messages`)
      .query({ limit: 0 })
      .set(headers)
      .expect(400);
    await request(app.getHttpServer())
      .get(`/conversations/${conversationId}/messages`)
      .query({ limit: 101 })
      .set(headers)
      .expect(400);
  });

  it("requires text or an attachment", async () => {
    const { owner, conversationId } = await createConversationFixture(app);
    const headers = authHeaders(owner.accessToken, owner.workspaceId);
    const url = `/conversations/${conversationId}/messages`;

    await request(app.getHttpServer())
      .post(url)
      .set(headers)
      .send({})
      .expect(400);
    // Content is trimmed before validation — whitespace-only is empty.
    await request(app.getHttpServer())
      .post(url)
      .set(headers)
      .send({ content: "   " })
      .expect(400);
    // Non-whitelisted properties are rejected by the global pipe.
    await request(app.getHttpServer())
      .post(url)
      .set(headers)
      .send({ content: "hi", sneaky: true })
      .expect(400);
  });

  it("rejects messages into resolved conversations with 409", async () => {
    const { owner, conversationId } = await createConversationFixture(app);
    const headers = authHeaders(owner.accessToken, owner.workspaceId);

    await request(app.getHttpServer())
      .post(`/conversations/${conversationId}/resolve`)
      .set(headers)
      .expect(200);

    await request(app.getHttpServer())
      .post(`/conversations/${conversationId}/messages`)
      .set(headers)
      .send({ content: "Too late" })
      .expect(409);
  });

  it("an agent message in a snoozed conversation reopens it", async () => {
    const { owner, conversationId } = await createConversationFixture(app);
    const headers = authHeaders(owner.accessToken, owner.workspaceId);

    await request(app.getHttpServer())
      .post(`/conversations/${conversationId}/snooze`)
      .set(headers)
      .expect(200);

    await request(app.getHttpServer())
      .post(`/conversations/${conversationId}/messages`)
      .set(headers)
      .send({ content: "Following up" })
      .expect(201);

    const detail = await request(app.getHttpServer())
      .get(`/conversations/${conversationId}`)
      .set(headers)
      .expect(200);
    expect(detail.body.status).toBe("OPEN");
  });

  it("returns 404 for unknown conversations and 401 without auth", async () => {
    const { owner, visitor, conversationId } =
      await createConversationFixture(app);
    const headers = authHeaders(owner.accessToken, owner.workspaceId);
    const missing = randomUUID();

    await request(app.getHttpServer())
      .get(`/conversations/${missing}/messages`)
      .set(headers)
      .expect(404);
    await request(app.getHttpServer())
      .post(`/conversations/${missing}/messages`)
      .set(headers)
      .send({ content: "hello" })
      .expect(404);

    await request(app.getHttpServer())
      .get(`/conversations/${conversationId}/messages`)
      .expect(401);
    // A visitor token is not an agent token.
    await request(app.getHttpServer())
      .get(`/conversations/${conversationId}/messages`)
      .set("Authorization", `Bearer ${visitor.visitorToken}`)
      .expect(401);

    // Visitor messaging still works after all of the above.
    const message = await sendVisitorMessage(
      app,
      visitor.visitorToken,
      "Still here",
    );
    expect(message.conversationId).toBe(conversationId);
  });
});
