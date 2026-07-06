import { INestApplication } from "@nestjs/common";
import request from "supertest";
import { randomUUID } from "node:crypto";
import { authHeaders, signupOwner, unique } from "./helpers/factories";
import { createTestApp } from "./helpers/test-app";

describe("email channel (integration, Resend mocked)", () => {
  let app: INestApplication;

  beforeAll(async () => {
    app = await createTestApp();
  });

  afterAll(async () => {
    await app.close();
  });

  async function mailboxFixture() {
    const owner = await signupOwner(app);
    const headers = authHeaders(owner.accessToken, owner.workspaceId);
    const mailbox = `${unique("support")}@test.helio.dev`;
    await request(app.getHttpServer())
      .post("/email/accounts")
      .set(headers)
      .send({ email: mailbox, displayName: "Support" })
      .expect(201);
    return { owner, headers, mailbox };
  }

  const inbound = (
    mailbox: string,
    overrides: Record<string, unknown> = {},
  ) => ({
    from: "customer@example.com",
    fromName: "Jane Customer",
    to: mailbox,
    subject: "Problem with my invoice",
    messageId: `<${randomUUID()}@example.com>`,
    text: "The total looks wrong.",
    ...overrides,
  });

  it("inbound email creates contact, EMAIL conversation, and message", async () => {
    const { headers, mailbox } = await mailboxFixture();

    await request(app.getHttpServer())
      .post("/email/webhook")
      .send(inbound(mailbox))
      .expect(200);

    const conversations = await request(app.getHttpServer())
      .get("/conversations")
      .set(headers)
      .expect(200);
    const emailConvo = conversations.body.data.find(
      (c: { channel: string }) => c.channel === "EMAIL",
    );
    expect(emailConvo).toBeDefined();
    expect(emailConvo.subject).toBe("Problem with my invoice");
    expect(emailConvo.contactName).toBe("Jane Customer");

    const messages = await request(app.getHttpServer())
      .get(`/conversations/${emailConvo.id}/messages`)
      .set(headers)
      .expect(200);
    expect(messages.body.data[0].content).toContain("total looks wrong");
  });

  it("a reply with In-Reply-To threads into the same conversation", async () => {
    const { headers, mailbox } = await mailboxFixture();
    const firstId = `<${randomUUID()}@example.com>`;

    await request(app.getHttpServer())
      .post("/email/webhook")
      .send(inbound(mailbox, { messageId: firstId }))
      .expect(200);
    await request(app.getHttpServer())
      .post("/email/webhook")
      .send(
        inbound(mailbox, {
          subject: "Re: Problem with my invoice",
          inReplyTo: firstId,
          text: "Following up on this.",
        }),
      )
      .expect(200);

    const conversations = await request(app.getHttpServer())
      .get("/conversations")
      .set(headers)
      .expect(200);
    const emailConvos = conversations.body.data.filter(
      (c: { channel: string }) => c.channel === "EMAIL",
    );
    expect(emailConvos).toHaveLength(1);

    const messages = await request(app.getHttpServer())
      .get(`/conversations/${emailConvos[0].id}/messages`)
      .set(headers)
      .expect(200);
    expect(messages.body.data).toHaveLength(2);
  });

  it("a reply to a RESOLVED thread starts a fresh conversation (terminal)", async () => {
    const { headers, mailbox } = await mailboxFixture();
    const firstId = `<${randomUUID()}@example.com>`;

    await request(app.getHttpServer())
      .post("/email/webhook")
      .send(inbound(mailbox, { messageId: firstId }))
      .expect(200);
    const conversations = await request(app.getHttpServer())
      .get("/conversations")
      .set(headers)
      .expect(200);
    const convo = conversations.body.data.find(
      (c: { channel: string }) => c.channel === "EMAIL",
    );

    await request(app.getHttpServer())
      .post(`/conversations/${convo.id}/resolve`)
      .set(headers)
      .expect(200);

    await request(app.getHttpServer())
      .post("/email/webhook")
      .send(
        inbound(mailbox, {
          inReplyTo: firstId,
          text: "Actually it is still broken",
        }),
      )
      .expect(200);

    // RESOLVED is terminal across channels: the old conversation stays
    // resolved and the reply lands in a brand-new one.
    const after = await request(app.getHttpServer())
      .get(`/conversations/${convo.id}`)
      .set(headers)
      .expect(200);
    expect(after.body.status).toBe("RESOLVED");

    const conversationsAfter = await request(app.getHttpServer())
      .get("/conversations")
      .set(headers)
      .expect(200);
    const emailConvos = conversationsAfter.body.data.filter(
      (c: { channel: string }) => c.channel === "EMAIL",
    );
    expect(emailConvos).toHaveLength(2);
  });

  it("unknown mailbox is rejected without creating anything", async () => {
    const { headers } = await mailboxFixture();

    // Unknown recipients are refused outright — 404 tells the provider
    // this mailbox does not exist here.
    await request(app.getHttpServer())
      .post("/email/webhook")
      .send(inbound(`${unique("ghost")}@nowhere.dev`))
      .expect(404);

    const conversations = await request(app.getHttpServer())
      .get("/conversations")
      .set(headers)
      .expect(200);
    expect(
      conversations.body.data.filter(
        (c: { channel: string }) => c.channel === "EMAIL",
      ),
    ).toHaveLength(0);
  });

  it("rejects malformed webhook payloads with 400", async () => {
    await request(app.getHttpServer())
      .post("/email/webhook")
      .send({ from: "not-an-email", text: "hi" })
      .expect(400);
  });

  it("agent outbound reply calls Resend with threaded headers (mocked)", async () => {
    const { headers, mailbox } = await mailboxFixture();
    const firstId = `<${randomUUID()}@example.com>`;
    await request(app.getHttpServer())
      .post("/email/webhook")
      .send(inbound(mailbox, { messageId: firstId }))
      .expect(200);
    const conversations = await request(app.getHttpServer())
      .get("/conversations")
      .set(headers)
      .expect(200);
    const convo = conversations.body.data.find(
      (c: { channel: string }) => c.channel === "EMAIL",
    );

    const fetchSpy = jest.spyOn(global, "fetch").mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ id: "mock-resend-id" }),
    } as unknown as Response);

    try {
      await request(app.getHttpServer())
        .post(`/email/conversations/${convo.id}/send`)
        .set(headers)
        .send({ content: "We are refunding the difference today." })
        .expect(201);

      expect(fetchSpy).toHaveBeenCalledTimes(1);
      const [url, init] = fetchSpy.mock.calls[0] as [string, RequestInit];
      expect(url).toContain("api.resend.com");
      const body = JSON.parse(init.body as string);
      expect(body.to).toContain("customer@example.com");
      expect(JSON.stringify(body)).toContain(firstId); // reply threading
      expect((init.headers as Record<string, string>).Authorization).toMatch(
        /^Bearer /,
      );

      // The reply is persisted as an agent message too.
      const messages = await request(app.getHttpServer())
        .get(`/conversations/${convo.id}/messages`)
        .set(headers)
        .expect(200);
      const agentMessage = messages.body.data.find(
        (m: { senderType: string }) => m.senderType === "USER",
      );
      expect(agentMessage.content).toContain("refunding");
    } finally {
      fetchSpy.mockRestore();
    }
  });
});
