import { INestApplication } from "@nestjs/common";
import request from "supertest";
import {
  authHeaders,
  createVisitorSession,
  sendVisitorMessage,
  signupOwner,
  unique,
  type OwnerContext,
} from "./helpers/factories";
import { createTestApp } from "./helpers/test-app";

/**
 * Multi-tenant isolation: workspace A must never read or mutate
 * workspace B's data, whatever the route. Two full tenants are built
 * up-front; every check drives A's credentials at B's resource ids.
 * The API's contract for foreign resources is 404 (existence is not
 * revealed), and 403 for workspace-header spoofing (membership check
 * fires before any lookup).
 */
describe("workspace isolation (integration)", () => {
  let app: INestApplication;

  interface Tenant {
    owner: OwnerContext;
    contactId: string;
    conversationId: string;
    messageId: string;
    attachmentId: string;
    categoryId: string;
    articleId: string;
    articleSlug: string;
    ruleId: string;
  }

  let a: Tenant;
  let b: Tenant;

  async function buildTenant(): Promise<Tenant> {
    const owner = await signupOwner(app);
    const headers = authHeaders(owner.accessToken, owner.workspaceId);
    const server = () => app.getHttpServer();

    const visitor = await createVisitorSession(app, owner.workspaceId);
    const message = await sendVisitorMessage(
      app,
      visitor.visitorToken,
      `tenant seed ${unique("msg")}`,
    );

    const conversation = await request(server())
      .get(`/conversations/${message.conversationId}`)
      .set(headers)
      .expect(200);
    const contactId = conversation.body.contact.id as string;

    const upload = await request(server())
      .post("/widget/attachments")
      .set("Authorization", `Bearer ${visitor.visitorToken}`)
      .attach("file", Buffer.from("isolation test file"), {
        filename: "note.txt",
        contentType: "text/plain",
      })
      .expect(201);

    const category = await request(server())
      .post("/kb/categories")
      .set(headers)
      .send({ name: unique("Category") })
      .expect(201);

    const article = await request(server())
      .post("/kb/articles")
      .set(headers)
      .send({
        title: unique("Article"),
        content: "Isolation test content",
        categoryId: category.body.id,
        isPublished: true,
      })
      .expect(201);

    const rule = await request(server())
      .post("/automation/rules")
      .set(headers)
      .send({
        name: unique("Rule"),
        trigger: "CONVERSATION_CREATED",
        conditions: [],
        actions: [{ type: "setPriority", priority: "HIGH" }],
      })
      .expect(201);

    return {
      owner,
      contactId,
      conversationId: message.conversationId,
      messageId: message.id,
      attachmentId: upload.body.id,
      categoryId: category.body.id,
      articleId: article.body.id,
      articleSlug: article.body.slug,
      ruleId: rule.body.id,
    };
  }

  beforeAll(async () => {
    app = await createTestApp();
    a = await buildTenant();
    b = await buildTenant();
  });

  afterAll(async () => {
    await app.close();
  });

  /** A's auth trying to touch B's resource. */
  const asA = () => authHeaders(a.owner.accessToken, a.owner.workspaceId);

  describe("contacts", () => {
    it("cannot read or update a foreign contact", async () => {
      await request(app.getHttpServer())
        .get(`/contacts/${b.contactId}`)
        .set(asA())
        .expect(404);
      await request(app.getHttpServer())
        .patch(`/contacts/${b.contactId}`)
        .set(asA())
        .send({ name: "hijacked" })
        .expect(404);
    });

    it("listing never includes foreign contacts", async () => {
      const list = await request(app.getHttpServer())
        .get("/contacts")
        .set(asA())
        .expect(200);
      const ids = (list.body.data ?? list.body).map(
        (c: { id: string }) => c.id,
      );
      expect(ids).toContain(a.contactId);
      expect(ids).not.toContain(b.contactId);
    });
  });

  describe("conversations & messages", () => {
    it("cannot read, resolve, or assign a foreign conversation", async () => {
      await request(app.getHttpServer())
        .get(`/conversations/${b.conversationId}`)
        .set(asA())
        .expect(404);
      await request(app.getHttpServer())
        .post(`/conversations/${b.conversationId}/resolve`)
        .set(asA())
        .expect(404);
      await request(app.getHttpServer())
        .post(`/conversations/${b.conversationId}/assign`)
        .set(asA())
        .send({ workspaceMemberId: null })
        .expect(404);
    });

    it("cannot list or send messages in a foreign conversation", async () => {
      await request(app.getHttpServer())
        .get(`/conversations/${b.conversationId}/messages`)
        .set(asA())
        .expect(404);
      await request(app.getHttpServer())
        .post(`/conversations/${b.conversationId}/messages`)
        .set(asA())
        .send({ content: "cross-tenant write attempt" })
        .expect(404);
    });

    it("conversation list never includes foreign conversations", async () => {
      const list = await request(app.getHttpServer())
        .get("/conversations")
        .set(asA())
        .expect(200);
      const ids = list.body.data.map((c: { id: string }) => c.id);
      expect(ids).toContain(a.conversationId);
      expect(ids).not.toContain(b.conversationId);
    });
  });

  describe("attachments", () => {
    it("cannot download or delete a foreign attachment", async () => {
      await request(app.getHttpServer())
        .get(`/attachments/${b.attachmentId}/download`)
        .set(asA())
        .expect(404);
      await request(app.getHttpServer())
        .delete(`/attachments/${b.attachmentId}`)
        .set(asA())
        .expect(404);
    });
  });

  describe("knowledge base", () => {
    it("cannot read or mutate foreign categories and articles", async () => {
      await request(app.getHttpServer())
        .get(`/kb/categories/${b.categoryId}`)
        .set(asA())
        .expect(404);
      await request(app.getHttpServer())
        .patch(`/kb/categories/${b.categoryId}`)
        .set(asA())
        .send({ name: "hijacked" })
        .expect(404);
      await request(app.getHttpServer())
        .get(`/kb/articles/${b.articleId}`)
        .set(asA())
        .expect(404);
      await request(app.getHttpServer())
        .patch(`/kb/articles/${b.articleId}`)
        .set(asA())
        .send({ title: "hijacked" })
        .expect(404);
      await request(app.getHttpServer())
        .delete(`/kb/articles/${b.articleId}`)
        .set(asA())
        .expect(404);
    });

    it("public help center is scoped: A's workspace never serves B's article", async () => {
      const listing = await request(app.getHttpServer())
        .get("/help")
        .query({ workspaceId: a.owner.workspaceId })
        .expect(200);
      const slugs = JSON.stringify(listing.body);
      expect(slugs).not.toContain(b.articleSlug);

      await request(app.getHttpServer())
        .get(`/help/articles/${b.articleSlug}`)
        .query({ workspaceId: a.owner.workspaceId })
        .expect(404);
    });
  });

  describe("automation", () => {
    it("cannot update or delete a foreign rule", async () => {
      await request(app.getHttpServer())
        .patch(`/automation/rules/${b.ruleId}`)
        .set(asA())
        .send({ enabled: false })
        .expect(404);
      await request(app.getHttpServer())
        .delete(`/automation/rules/${b.ruleId}`)
        .set(asA())
        .expect(404);
    });

    it("rule listing never includes foreign rules", async () => {
      const list = await request(app.getHttpServer())
        .get("/automation/rules")
        .set(asA())
        .expect(200);
      const ids = (list.body.data ?? list.body).map(
        (r: { id: string }) => r.id,
      );
      expect(ids).toContain(a.ruleId);
      expect(ids).not.toContain(b.ruleId);
    });
  });

  describe("audit", () => {
    it("audit log never contains foreign workspace entries", async () => {
      const logs = await request(app.getHttpServer())
        .get("/audit/logs")
        .set(asA())
        .expect(200);
      const serialized = JSON.stringify(logs.body);
      expect(serialized).not.toContain(b.conversationId);
      expect(serialized).not.toContain(b.owner.workspaceId);
    });
  });

  describe("AI", () => {
    it("AI endpoints 404 on a foreign conversation before any provider call", async () => {
      const fetchSpy = jest.spyOn(global, "fetch");
      try {
        await request(app.getHttpServer())
          .post(`/ai/conversations/${b.conversationId}/summary`)
          .set(asA())
          .expect(404);
        await request(app.getHttpServer())
          .post(`/ai/conversations/${b.conversationId}/reply`)
          .set(asA())
          .expect(404);
        expect(fetchSpy).not.toHaveBeenCalled();
      } finally {
        fetchSpy.mockRestore();
      }
    });
  });

  describe("widget", () => {
    it("a visitor token from workspace A cannot be minted against B's conversation", async () => {
      // A fresh visitor in A gets their own conversation — never B's.
      const visitor = await createVisitorSession(app, a.owner.workspaceId);
      const message = await sendVisitorMessage(
        app,
        visitor.visitorToken,
        "isolation probe",
      );
      expect(message.conversationId).not.toBe(b.conversationId);

      // And their message history is their own conversation only.
      const history = await request(app.getHttpServer())
        .get("/widget/messages")
        .set("Authorization", `Bearer ${visitor.visitorToken}`)
        .expect(200);
      const conversationIds = new Set(
        (history.body.data ?? history.body).map(
          (m: { conversationId: string }) => m.conversationId,
        ),
      );
      expect(conversationIds.has(b.conversationId)).toBe(false);
    });
  });

  describe("workspace header spoofing", () => {
    it("A's token with B's workspace header is rejected on every scoped route", async () => {
      const spoofed = authHeaders(a.owner.accessToken, b.owner.workspaceId);
      for (const [method, path] of [
        ["get", "/contacts"],
        ["get", "/conversations"],
        ["get", "/kb/articles"],
        ["get", "/automation/rules"],
        ["get", "/audit/logs"],
      ] as const) {
        await request(app.getHttpServer())
          [method](path)
          .set(spoofed)
          .expect(403);
      }
    });

    it("B's real resources stay untouched after all attempts", async () => {
      const asB = authHeaders(b.owner.accessToken, b.owner.workspaceId);
      const conversation = await request(app.getHttpServer())
        .get(`/conversations/${b.conversationId}`)
        .set(asB)
        .expect(200);
      expect(conversation.body.status).toBe("OPEN");

      const article = await request(app.getHttpServer())
        .get(`/kb/articles/${b.articleId}`)
        .set(asB)
        .expect(200);
      expect(article.body.title).not.toBe("hijacked");
    });
  });
});
