import { INestApplication } from "@nestjs/common";
import { randomUUID } from "node:crypto";
import request from "supertest";
import {
  authHeaders,
  createConversationFixture,
  createVisitorSession,
  sendVisitorMessage,
  signupOwner,
  unique,
} from "./helpers/factories";
import { createTestApp } from "./helpers/test-app";

describe("contacts (integration)", () => {
  let app: INestApplication;

  beforeAll(async () => {
    app = await createTestApp();
  });

  afterAll(async () => {
    await app.close();
  });

  it("widget sessions lazily create contacts with a visitor name", async () => {
    const owner = await signupOwner(app);
    const visitor = await createVisitorSession(app, owner.workspaceId);

    const list = await request(app.getHttpServer())
      .get("/contacts")
      .set(authHeaders(owner.accessToken, owner.workspaceId))
      .expect(200);

    expect(list.body.total).toBe(1);
    expect(list.body.page).toBe(1);
    expect(list.body.limit).toBe(20);
    expect(list.body.data[0]).toMatchObject({
      name: `Visitor ${visitor.visitorId.slice(0, 8)}`,
      email: null,
      phone: null,
    });
    expect(list.body.data[0].id).toBeDefined();

    // Re-bootstrapping the same visitor is idempotent — still one contact.
    await createVisitorSession(app, owner.workspaceId, visitor.visitorId);
    const again = await request(app.getHttpServer())
      .get("/contacts")
      .set(authHeaders(owner.accessToken, owner.workspaceId))
      .expect(200);
    expect(again.body.total).toBe(1);
  });

  it("returns contact detail with conversation stats", async () => {
    const { owner, conversationId } = await createConversationFixture(app);
    const headers = authHeaders(owner.accessToken, owner.workspaceId);

    const detail = await request(app.getHttpServer())
      .get(`/conversations/${conversationId}`)
      .set(headers)
      .expect(200);
    const contactId = detail.body.contactId;

    const res = await request(app.getHttpServer())
      .get(`/contacts/${contactId}`)
      .set(headers)
      .expect(200);
    expect(res.body).toMatchObject({
      id: contactId,
      name: expect.stringMatching(/^Visitor /),
      totalConversations: 1,
      openConversations: 1,
    });
    expect(res.body.lastConversationAt).toBeDefined();
    expect(res.body.lastConversationAt).not.toBeNull();
  });

  it("updates name, email, and phone with validation", async () => {
    const { owner, conversationId } = await createConversationFixture(app);
    const headers = authHeaders(owner.accessToken, owner.workspaceId);
    const detail = await request(app.getHttpServer())
      .get(`/conversations/${conversationId}`)
      .set(headers)
      .expect(200);
    const contactId = detail.body.contactId;
    const email = `${unique("contact")}@Example.COM`;

    const updated = await request(app.getHttpServer())
      .patch(`/contacts/${contactId}`)
      .set(headers)
      .send({ name: "Jane Customer", email, phone: "+91 98765 43210" })
      .expect(200);
    expect(updated.body).toMatchObject({
      id: contactId,
      name: "Jane Customer",
      // Emails are normalized to lowercase.
      email: email.toLowerCase(),
      phone: "+91 98765 43210",
    });

    // Invalid payloads → 400.
    await request(app.getHttpServer())
      .patch(`/contacts/${contactId}`)
      .set(headers)
      .send({ email: "not-an-email" })
      .expect(400);
    await request(app.getHttpServer())
      .patch(`/contacts/${contactId}`)
      .set(headers)
      .send({ name: "" })
      .expect(400);
    await request(app.getHttpServer())
      .patch(`/contacts/${contactId}`)
      .set(headers)
      .send({ phone: "9".repeat(51) })
      .expect(400);
    await request(app.getHttpServer())
      .patch(`/contacts/${contactId}`)
      .set(headers)
      .send({ visitorId: "hijack" })
      .expect(400);
  });

  it("rejects an email already used by another contact in the workspace", async () => {
    const owner = await signupOwner(app);
    const headers = authHeaders(owner.accessToken, owner.workspaceId);
    const first = await createVisitorSession(app, owner.workspaceId);
    const second = await createVisitorSession(app, owner.workspaceId);

    const list = await request(app.getHttpServer())
      .get("/contacts")
      .set(headers)
      .expect(200);
    expect(list.body.total).toBe(2);
    const names = new Map<string, string>(
      list.body.data.map((c: { name: string; id: string }) => [c.name, c.id]),
    );
    const firstId = names.get(`Visitor ${first.visitorId.slice(0, 8)}`);
    const secondId = names.get(`Visitor ${second.visitorId.slice(0, 8)}`);
    expect(firstId).toBeDefined();
    expect(secondId).toBeDefined();

    const email = `${unique("dup")}@test.helio.dev`;
    await request(app.getHttpServer())
      .patch(`/contacts/${firstId}`)
      .set(headers)
      .send({ email })
      .expect(200);
    await request(app.getHttpServer())
      .patch(`/contacts/${secondId}`)
      .set(headers)
      .send({ email: email.toUpperCase() })
      .expect(409);
  });

  it("searches contacts by name or email and paginates", async () => {
    const owner = await signupOwner(app);
    const headers = authHeaders(owner.accessToken, owner.workspaceId);
    await createVisitorSession(app, owner.workspaceId);
    const target = await createVisitorSession(app, owner.workspaceId);

    const list = await request(app.getHttpServer())
      .get("/contacts")
      .set(headers)
      .expect(200);
    const targetId = list.body.data.find(
      (c: { name: string }) =>
        c.name === `Visitor ${target.visitorId.slice(0, 8)}`,
    ).id;

    const marker = unique("needle").toLowerCase();
    await request(app.getHttpServer())
      .patch(`/contacts/${targetId}`)
      .set(headers)
      .send({ name: `Named ${marker}`, email: `${marker}@test.helio.dev` })
      .expect(200);

    // Search by name fragment (case-insensitive).
    const byName = await request(app.getHttpServer())
      .get("/contacts")
      .query({ search: marker.toUpperCase() })
      .set(headers)
      .expect(200);
    expect(byName.body.total).toBe(1);
    expect(byName.body.data[0].id).toBe(targetId);

    // Search by email fragment.
    const byEmail = await request(app.getHttpServer())
      .get("/contacts")
      .query({ search: `${marker}@test` })
      .set(headers)
      .expect(200);
    expect(byEmail.body.total).toBe(1);

    // No match.
    const none = await request(app.getHttpServer())
      .get("/contacts")
      .query({ search: unique("no-such-contact") })
      .set(headers)
      .expect(200);
    expect(none.body.total).toBe(0);

    // Pagination applies within the workspace.
    const page = await request(app.getHttpServer())
      .get("/contacts")
      .query({ page: 1, limit: 1 })
      .set(headers)
      .expect(200);
    expect(page.body.data).toHaveLength(1);
    expect(page.body.total).toBe(2);
  });

  it("lists a contact's conversations by latest activity", async () => {
    const { owner, visitor, conversationId } =
      await createConversationFixture(app);
    const headers = authHeaders(owner.accessToken, owner.workspaceId);
    const detail = await request(app.getHttpServer())
      .get(`/conversations/${conversationId}`)
      .set(headers)
      .expect(200);
    const contactId = detail.body.contactId;

    // Resolve the first thread, then a fresh session opens a second one.
    await request(app.getHttpServer())
      .post(`/conversations/${conversationId}/resolve`)
      .set(headers)
      .expect(200);
    const fresh = await createVisitorSession(
      app,
      owner.workspaceId,
      visitor.visitorId,
    );
    const second = await sendVisitorMessage(
      app,
      fresh.visitorToken,
      "Second thread",
    );

    const res = await request(app.getHttpServer())
      .get(`/contacts/${contactId}/conversations`)
      .set(headers)
      .expect(200);
    expect(res.body.total).toBe(2);
    expect(res.body.data.map((c: { id: string }) => c.id)).toEqual([
      second.conversationId,
      conversationId,
    ]);
    expect(
      res.body.data.every(
        (c: { contactId: string }) => c.contactId === contactId,
      ),
    ).toBe(true);
  });

  it("returns 404 for unknown or foreign contacts and 401 without auth", async () => {
    const { owner, conversationId } = await createConversationFixture(app);
    const headers = authHeaders(owner.accessToken, owner.workspaceId);
    const detail = await request(app.getHttpServer())
      .get(`/conversations/${conversationId}`)
      .set(headers)
      .expect(200);
    const contactId = detail.body.contactId;
    const missing = randomUUID();

    await request(app.getHttpServer())
      .get(`/contacts/${missing}`)
      .set(headers)
      .expect(404);
    await request(app.getHttpServer())
      .patch(`/contacts/${missing}`)
      .set(headers)
      .send({ name: "Ghost" })
      .expect(404);
    await request(app.getHttpServer())
      .get(`/contacts/${missing}/conversations`)
      .set(headers)
      .expect(404);
    await request(app.getHttpServer())
      .get("/contacts/not-a-uuid")
      .set(headers)
      .expect(400);

    // Tenancy: a different workspace cannot see this contact.
    const stranger = await signupOwner(app);
    await request(app.getHttpServer())
      .get(`/contacts/${contactId}`)
      .set(authHeaders(stranger.accessToken, stranger.workspaceId))
      .expect(404);

    await request(app.getHttpServer()).get("/contacts").expect(401);
  });
});
