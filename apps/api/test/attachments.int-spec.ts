import { INestApplication } from "@nestjs/common";
import { randomUUID } from "node:crypto";
import request from "supertest";
import {
  authHeaders,
  createConversationFixture,
  createVisitorSession,
  signupOwner,
  unique,
} from "./helpers/factories";
import { createTestApp } from "./helpers/test-app";

const TEN_MB = 10 * 1024 * 1024;

describe("attachments (integration)", () => {
  let app: INestApplication;

  beforeAll(async () => {
    app = await createTestApp();
  });

  afterAll(async () => {
    await app.close();
  });

  it("agent uploads a file and downloads the same bytes back", async () => {
    const { owner, conversationId } = await createConversationFixture(app);
    const headers = authHeaders(owner.accessToken, owner.workspaceId);
    const content = `attachment payload ${unique("blob")}`;

    const uploaded = await request(app.getHttpServer())
      .post("/attachments")
      .set(headers)
      .field("conversationId", conversationId)
      .attach("file", Buffer.from(content), {
        filename: "report.txt",
        contentType: "text/plain",
      })
      .expect(201);

    expect(uploaded.body).toMatchObject({
      conversationId,
      messageId: null,
      filename: "report.txt",
      mimeType: "text/plain",
      size: Buffer.byteLength(content),
    });
    expect(uploaded.body.id).toBeDefined();
    // Internal storage details never leak into the response.
    expect(uploaded.body).not.toHaveProperty("storageKey");
    expect(uploaded.body).not.toHaveProperty("provider");

    const meta = await request(app.getHttpServer())
      .get(`/attachments/${uploaded.body.id}`)
      .set(headers)
      .expect(200);
    expect(meta.body.id).toBe(uploaded.body.id);

    // Local provider streams the bytes back (no redirect).
    const download = await request(app.getHttpServer())
      .get(`/attachments/${uploaded.body.id}/download`)
      .set(headers)
      .expect(200);
    expect(download.headers["content-type"]).toContain("text/plain");
    expect(download.headers["content-disposition"]).toContain(
      'filename="report.txt"',
    );
    expect(download.text).toBe(content);
  });

  it("rejects a file over the 10 MB limit with 413", async () => {
    const { owner, conversationId } = await createConversationFixture(app);

    await request(app.getHttpServer())
      .post("/attachments")
      .set(authHeaders(owner.accessToken, owner.workspaceId))
      .field("conversationId", conversationId)
      .attach("file", Buffer.alloc(TEN_MB + 1, "a"), {
        filename: "huge.txt",
        contentType: "text/plain",
      })
      .expect(413);
  }, 60000);

  it("rejects unsupported MIME types and forbidden extensions with 415", async () => {
    const { owner, conversationId } = await createConversationFixture(app);
    const headers = authHeaders(owner.accessToken, owner.workspaceId);

    // MIME allowlist: archives are not accepted.
    await request(app.getHttpServer())
      .post("/attachments")
      .set(headers)
      .field("conversationId", conversationId)
      .attach("file", Buffer.from("PK..."), {
        filename: "archive.zip",
        contentType: "application/zip",
      })
      .expect(415);

    // Forbidden extension wins even under an allowed MIME type.
    await request(app.getHttpServer())
      .post("/attachments")
      .set(headers)
      .field("conversationId", conversationId)
      .attach("file", Buffer.from("alert(1)"), {
        filename: "evil.js",
        contentType: "text/plain",
      })
      .expect(415);
  });

  it("rejects empty files, missing file field, and bad conversation ids", async () => {
    const { owner, conversationId } = await createConversationFixture(app);
    const headers = authHeaders(owner.accessToken, owner.workspaceId);

    await request(app.getHttpServer())
      .post("/attachments")
      .set(headers)
      .field("conversationId", conversationId)
      .attach("file", Buffer.alloc(0), {
        filename: "empty.txt",
        contentType: "text/plain",
      })
      .expect(400);

    await request(app.getHttpServer())
      .post("/attachments")
      .set(headers)
      .field("conversationId", conversationId)
      .expect(400);

    // Unknown conversation in this workspace → 404 before any byte lands.
    await request(app.getHttpServer())
      .post("/attachments")
      .set(headers)
      .field("conversationId", randomUUID())
      .attach("file", Buffer.from("hello"), {
        filename: "note.txt",
        contentType: "text/plain",
      })
      .expect(404);

    await request(app.getHttpServer())
      .post("/attachments")
      .set(headers)
      .field("conversationId", "not-a-uuid")
      .attach("file", Buffer.from("hello"), {
        filename: "note.txt",
        contentType: "text/plain",
      })
      .expect(400);
  });

  it("links an uploaded attachment to a message exactly once", async () => {
    const { owner, conversationId } = await createConversationFixture(app);
    const headers = authHeaders(owner.accessToken, owner.workspaceId);

    const uploaded = await request(app.getHttpServer())
      .post("/attachments")
      .set(headers)
      .field("conversationId", conversationId)
      .attach("file", Buffer.from("invoice body"), {
        filename: "invoice.pdf",
        contentType: "application/pdf",
      })
      .expect(201);
    const attachmentId = uploaded.body.id;

    const message = await request(app.getHttpServer())
      .post(`/conversations/${conversationId}/messages`)
      .set(headers)
      .send({ content: "Here is the invoice", attachmentIds: [attachmentId] })
      .expect(201);
    expect(message.body.metadata.attachments).toEqual([
      {
        id: attachmentId,
        filename: "invoice.pdf",
        mimeType: "application/pdf",
        size: Buffer.byteLength("invoice body"),
        url: null,
      },
    ]);

    // The attachment now belongs to that message on the conversation.
    const meta = await request(app.getHttpServer())
      .get(`/attachments/${attachmentId}`)
      .set(headers)
      .expect(200);
    expect(meta.body.messageId).toBe(message.body.id);
    expect(meta.body.conversationId).toBe(conversationId);

    // Listed in the agent message view with its metadata.
    const list = await request(app.getHttpServer())
      .get(`/conversations/${conversationId}/messages`)
      .set(headers)
      .expect(200);
    const withAttachment = list.body.data.find(
      (m: { id: string }) => m.id === message.body.id,
    );
    expect(withAttachment.metadata.attachments[0].id).toBe(attachmentId);

    // Already-sent attachments cannot be attached again.
    await request(app.getHttpServer())
      .post(`/conversations/${conversationId}/messages`)
      .set(headers)
      .send({ content: "resend", attachmentIds: [attachmentId] })
      .expect(404);
  });

  it("widget visitor uploads into their own conversation", async () => {
    const { owner, visitor, conversationId } =
      await createConversationFixture(app);
    const visitorAuth = { Authorization: `Bearer ${visitor.visitorToken}` };
    const content = `visitor upload ${unique("blob")}`;

    const uploaded = await request(app.getHttpServer())
      .post("/widget/attachments")
      .set(visitorAuth)
      .attach("file", Buffer.from(content), {
        filename: "screenshot.png",
        contentType: "image/png",
      })
      .expect(201);
    // Scope is pinned by the visitor token.
    expect(uploaded.body.conversationId).toBe(conversationId);
    expect(uploaded.body.filename).toBe("screenshot.png");
    expect(uploaded.body.mimeType).toBe("image/png");

    // Visitor sends it as a message; the preview shows the file.
    const message = await request(app.getHttpServer())
      .post("/widget/messages")
      .set(visitorAuth)
      .send({ attachmentIds: [uploaded.body.id] })
      .expect(201);
    expect(message.body.metadata.attachments[0].id).toBe(uploaded.body.id);

    const agentHeaders = authHeaders(owner.accessToken, owner.workspaceId);
    const detail = await request(app.getHttpServer())
      .get(`/conversations/${conversationId}`)
      .set(agentHeaders)
      .expect(200);
    expect(detail.body.lastMessagePreview).toContain("screenshot.png");

    // The visitor can download their own file...
    const download = await request(app.getHttpServer())
      .get(`/widget/attachments/${uploaded.body.id}/download`)
      .set(visitorAuth)
      .expect(200);
    expect(download.body.toString()).toBe(content);

    // ...and so can the agent from the workspace side.
    await request(app.getHttpServer())
      .get(`/attachments/${uploaded.body.id}/download`)
      .set(agentHeaders)
      .expect(200);

    // Another visitor in the same workspace cannot reach it.
    const otherVisitor = await createVisitorSession(app, owner.workspaceId);
    await request(app.getHttpServer())
      .get(`/widget/attachments/${uploaded.body.id}/download`)
      .set("Authorization", `Bearer ${otherVisitor.visitorToken}`)
      .expect(400);

    // Widget uploads require a visitor token.
    await request(app.getHttpServer())
      .post("/widget/attachments")
      .attach("file", Buffer.from("x"), {
        filename: "anon.txt",
        contentType: "text/plain",
      })
      .expect(401);
  });

  it("enforces tenancy and deletes attachments", async () => {
    const { owner, conversationId } = await createConversationFixture(app);
    const headers = authHeaders(owner.accessToken, owner.workspaceId);

    const uploaded = await request(app.getHttpServer())
      .post("/attachments")
      .set(headers)
      .field("conversationId", conversationId)
      .attach("file", Buffer.from("to be deleted"), {
        filename: "temp.txt",
        contentType: "text/plain",
      })
      .expect(201);
    const attachmentId = uploaded.body.id;

    // Another workspace can neither read nor download it.
    const stranger = await signupOwner(app);
    await request(app.getHttpServer())
      .get(`/attachments/${attachmentId}`)
      .set(authHeaders(stranger.accessToken, stranger.workspaceId))
      .expect(404);
    await request(app.getHttpServer())
      .get(`/attachments/${attachmentId}/download`)
      .set(authHeaders(stranger.accessToken, stranger.workspaceId))
      .expect(404);

    // Owner deletes file + metadata; both are gone afterwards.
    await request(app.getHttpServer())
      .delete(`/attachments/${attachmentId}`)
      .set(headers)
      .expect(204);
    await request(app.getHttpServer())
      .get(`/attachments/${attachmentId}`)
      .set(headers)
      .expect(404);
    await request(app.getHttpServer())
      .get(`/attachments/${randomUUID()}`)
      .set(headers)
      .expect(404);
  });
});
