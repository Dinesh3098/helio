import { INestApplication } from "@nestjs/common";
import request from "supertest";
import {
  authHeaders,
  createVisitorSession,
  sendVisitorMessage,
  signupOwner,
  unique,
} from "./helpers/factories";
import { createTestApp } from "./helpers/test-app";

/** Automation runs are event-driven; poll briefly for the outcome. */
async function eventually<T>(
  probe: () => Promise<T | undefined>,
  timeoutMs = 8000,
): Promise<T> {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const result = await probe();
    if (result !== undefined) return result;
    if (Date.now() > deadline) throw new Error("condition never became true");
    await new Promise((r) => setTimeout(r, 250));
  }
}

describe("automation engine (integration)", () => {
  let app: INestApplication;

  beforeAll(async () => {
    app = await createTestApp();
  });

  afterAll(async () => {
    await app.close();
  });

  it("validates rule payloads (unknown action type → 400)", async () => {
    const owner = await signupOwner(app);
    await request(app.getHttpServer())
      .post("/automation/rules")
      .set(authHeaders(owner.accessToken, owner.workspaceId))
      .send({
        name: unique("Bad rule"),
        trigger: "CONVERSATION_CREATED",
        conditions: [],
        actions: [{ type: "launchMissiles" }],
      })
      .expect(400);
  });

  it("CONVERSATION_CREATED rule fires: priority set, tag added, execution recorded", async () => {
    const owner = await signupOwner(app);
    const headers = authHeaders(owner.accessToken, owner.workspaceId);
    const tag = unique("vip");

    const rule = await request(app.getHttpServer())
      .post("/automation/rules")
      .set(headers)
      .send({
        name: unique("Prioritize new chats"),
        trigger: "CONVERSATION_CREATED",
        conditions: [],
        actions: [
          { type: "setPriority", priority: "HIGH" },
          { type: "addTag", tag },
        ],
      })
      .expect(201);

    const visitor = await createVisitorSession(app, owner.workspaceId);
    const { conversationId } = await sendVisitorMessage(
      app,
      visitor.visitorToken,
      "hello, automation should fire",
    );

    const updated = await eventually(async () => {
      const res = await request(app.getHttpServer())
        .get(`/conversations/${conversationId}`)
        .set(headers);
      return res.body.priority === "HIGH" && res.body.tags.includes(tag)
        ? res.body
        : undefined;
    });
    expect(updated.priority).toBe("HIGH");
    expect(updated.tags).toContain(tag);

    // Execution history records a SUCCESS run for this rule.
    const history = await eventually(async () => {
      const res = await request(app.getHttpServer())
        .get("/automation/history")
        .set(headers)
        .expect(200);
      const rows = res.body.data ?? res.body;
      const run = rows.find(
        (r: { ruleId?: string; rule?: { id: string }; status: string }) =>
          (r.ruleId ?? r.rule?.id) === rule.body.id,
      );
      return run?.status === "SUCCESS" ? run : undefined;
    });
    expect(history.status).toBe("SUCCESS");
  });

  it("disabled rules never fire", async () => {
    const owner = await signupOwner(app);
    const headers = authHeaders(owner.accessToken, owner.workspaceId);

    await request(app.getHttpServer())
      .post("/automation/rules")
      .set(headers)
      .send({
        name: unique("Disabled rule"),
        trigger: "CONVERSATION_CREATED",
        enabled: false,
        conditions: [],
        actions: [{ type: "setPriority", priority: "LOW" }],
      })
      .expect(201);

    const visitor = await createVisitorSession(app, owner.workspaceId);
    const { conversationId } = await sendVisitorMessage(
      app,
      visitor.visitorToken,
      "quiet please",
    );

    // Give the engine a moment, then confirm nothing changed.
    await new Promise((r) => setTimeout(r, 1500));
    const convo = await request(app.getHttpServer())
      .get(`/conversations/${conversationId}`)
      .set(headers)
      .expect(200);
    expect(convo.body.priority).toBe("MEDIUM");
  });

  it("conditions gate execution (contains-match on message content)", async () => {
    const owner = await signupOwner(app);
    const headers = authHeaders(owner.accessToken, owner.workspaceId);
    const tag = unique("refund");

    // Read the evaluator's condition contract from automation.types.ts:
    // messageContent contains — fires only when the trigger message matches.
    await request(app.getHttpServer())
      .post("/automation/rules")
      .set(headers)
      .send({
        name: unique("Tag refund requests"),
        trigger: "MESSAGE_RECEIVED",
        conditions: [{ type: "messageContains", value: "refund" }],
        actions: [{ type: "addTag", tag }],
      })
      .expect(201);

    const visitor = await createVisitorSession(app, owner.workspaceId);
    const { conversationId } = await sendVisitorMessage(
      app,
      visitor.visitorToken,
      "I would like a refund for my order",
    );

    const tagged = await eventually(async () => {
      const res = await request(app.getHttpServer())
        .get(`/conversations/${conversationId}`)
        .set(headers);
      return res.body.tags.includes(tag) ? res.body : undefined;
    });
    expect(tagged.tags).toContain(tag);

    // A non-matching message in a fresh conversation stays untagged.
    const visitor2 = await createVisitorSession(app, owner.workspaceId);
    const other = await sendVisitorMessage(
      app,
      visitor2.visitorToken,
      "just saying hi",
    );
    await new Promise((r) => setTimeout(r, 1500));
    const untouched = await request(app.getHttpServer())
      .get(`/conversations/${other.conversationId}`)
      .set(headers)
      .expect(200);
    expect(untouched.body.tags).not.toContain(tag);
  });
});
