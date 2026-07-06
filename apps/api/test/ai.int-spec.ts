import { INestApplication } from "@nestjs/common";
import request from "supertest";
import {
  authHeaders,
  createVisitorSession,
  sendVisitorMessage,
  signupOwner,
} from "./helpers/factories";
import { createTestApp } from "./helpers/test-app";

/** Canned Gemini success body with the given text. */
const geminiResponse = (text: string) => ({
  ok: true,
  status: 200,
  json: async () => ({
    candidates: [{ content: { parts: [{ text }] } }],
  }),
});

describe("ai (integration, provider mocked)", () => {
  let app: INestApplication;
  let fetchSpy: jest.SpyInstance;

  beforeAll(async () => {
    app = await createTestApp();
  });

  beforeEach(() => {
    fetchSpy = jest.spyOn(global, "fetch");
  });

  afterEach(() => {
    fetchSpy.mockRestore();
  });

  afterAll(async () => {
    await app.close();
  });

  async function fixture() {
    const owner = await signupOwner(app);
    const visitor = await createVisitorSession(app, owner.workspaceId);
    const { conversationId } = await sendVisitorMessage(
      app,
      visitor.visitorToken,
      "My invoice from last month is wrong, please help",
    );
    return {
      owner,
      visitor,
      conversationId,
      headers: authHeaders(owner.accessToken, owner.workspaceId),
    };
  }

  it("generates a summary and caches it until a new message lands", async () => {
    const { conversationId, headers, visitor } = await fixture();
    fetchSpy.mockResolvedValue(
      geminiResponse("Customer reports an invoice discrepancy.") as never,
    );

    // No summary yet.
    await request(app.getHttpServer())
      .get(`/ai/conversations/${conversationId}/summary`)
      .set(headers)
      .expect(404);

    const generated = await request(app.getHttpServer())
      .post(`/ai/conversations/${conversationId}/summary`)
      .set(headers)
      .expect(200);
    expect(generated.body.summary).toContain("invoice discrepancy");
    const callsAfterFirst = fetchSpy.mock.calls.length;
    expect(callsAfterFirst).toBe(1);

    // Fresh summary → served from cache, no provider call.
    await request(app.getHttpServer())
      .post(`/ai/conversations/${conversationId}/summary`)
      .set(headers)
      .expect(200);
    expect(fetchSpy.mock.calls.length).toBe(callsAfterFirst);

    // A new message invalidates the cache → regeneration calls out again.
    await sendVisitorMessage(app, visitor.visitorToken, "any update?");
    await request(app.getHttpServer())
      .post(`/ai/conversations/${conversationId}/summary`)
      .set(headers)
      .expect(200);
    expect(fetchSpy.mock.calls.length).toBe(callsAfterFirst + 1);
  });

  it("suggests a reply and rewrites a draft", async () => {
    const { conversationId, headers } = await fixture();
    fetchSpy.mockResolvedValue(
      geminiResponse(
        "Sorry about the invoice — here is what we found.",
      ) as never,
    );

    const reply = await request(app.getHttpServer())
      .post(`/ai/conversations/${conversationId}/reply`)
      .set(headers)
      .send({})
      .expect(200);
    expect(reply.body.text).toContain("invoice");

    const rewritten = await request(app.getHttpServer())
      .post("/ai/rewrite")
      .set(headers)
      .send({ draft: "fix soon ok", style: "PROFESSIONAL" })
      .expect(200);
    expect(rewritten.body.text).toBeDefined();

    await request(app.getHttpServer())
      .post("/ai/rewrite")
      .set(headers)
      .send({ draft: "text", style: "SARCASTIC" })
      .expect(400);
  });

  it("classifies a conversation from structured provider JSON", async () => {
    const { conversationId, headers } = await fixture();
    fetchSpy.mockResolvedValue(
      geminiResponse(
        JSON.stringify({
          category: "BILLING",
          priority: "HIGH",
          sentiment: "NEGATIVE",
          intent: "Invoice correction",
        }),
      ) as never,
    );

    const classification = await request(app.getHttpServer())
      .post(`/ai/conversations/${conversationId}/classify`)
      .set(headers)
      .expect(200);
    expect(classification.body.category).toBe("BILLING");
    expect(classification.body.priority).toBe("HIGH");
  });

  it("degrades gracefully on provider failure modes", async () => {
    const { conversationId, headers } = await fixture();

    // Timeout (abort) → 5xx-class mapped error, not a crash.
    const abortError = new Error("The operation was aborted");
    abortError.name = "AbortError";
    fetchSpy.mockRejectedValueOnce(abortError);
    const timeout = await request(app.getHttpServer())
      .post(`/ai/conversations/${conversationId}/summary`)
      .set(headers);
    expect(timeout.status).toBeGreaterThanOrEqual(400);

    // Provider 429 → mapped quota error.
    fetchSpy.mockResolvedValueOnce({
      ok: false,
      status: 429,
      json: async () => ({ error: { message: "quota exceeded" } }),
      text: async () => "quota exceeded",
    } as never);
    const quota = await request(app.getHttpServer())
      .post(`/ai/conversations/${conversationId}/summary`)
      .set(headers);
    expect(quota.status).toBeGreaterThanOrEqual(400);

    // Malformed body (no candidates) → mapped error.
    fetchSpy.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({ unexpected: true }),
    } as never);
    const malformed = await request(app.getHttpServer())
      .post(`/ai/conversations/${conversationId}/summary`)
      .set(headers);
    expect(malformed.status).toBeGreaterThanOrEqual(400);

    // The API is still alive and correct afterwards.
    fetchSpy.mockResolvedValue(geminiResponse("recovered") as never);
    await request(app.getHttpServer())
      .post(`/ai/conversations/${conversationId}/summary`)
      .set(headers)
      .expect(200);
  });

  it("suggests published KB articles for the conversation", async () => {
    const { conversationId, headers, owner } = await fixture();

    const category = await request(app.getHttpServer())
      .post("/kb/categories")
      .set(authHeaders(owner.accessToken, owner.workspaceId))
      .send({ name: "Billing" })
      .expect(201);
    const article = await request(app.getHttpServer())
      .post("/kb/articles")
      .set(authHeaders(owner.accessToken, owner.workspaceId))
      .send({
        title: "Fixing invoice mistakes",
        content: "How we correct billing errors.",
        categoryId: category.body.id,
        isPublished: true,
      })
      .expect(201);

    fetchSpy.mockResolvedValue(
      geminiResponse(JSON.stringify([article.body.id])) as never,
    );

    const suggestions = await request(app.getHttpServer())
      .post(`/ai/conversations/${conversationId}/kb`)
      .set(headers)
      .expect(200);
    expect(Array.isArray(suggestions.body)).toBe(true);
  });
});
