import { INestApplication } from "@nestjs/common";
import { randomUUID } from "node:crypto";
import request from "supertest";

/**
 * Data factories built on the public API — tests create tenants exactly
 * the way real clients do. Every identifier is unique per call, so test
 * files can run in parallel against the shared database without
 * truncation or cross-test interference. Never TRUNCATE test tables.
 */

export const unique = (prefix: string): string =>
  `${prefix}-${randomUUID().slice(0, 8)}`;

export const TEST_PASSWORD = "Str0ng!Passw0rd42";

export interface OwnerContext {
  userId: string;
  email: string;
  password: string;
  workspaceId: string;
  workspaceName: string;
  accessToken: string;
  refreshToken: string;
}

/** Signs up a fresh owner + workspace; the standard test entry point. */
export async function signupOwner(
  app: INestApplication,
  overrides: Partial<{
    name: string;
    email: string;
    password: string;
    workspaceName: string;
  }> = {},
): Promise<OwnerContext> {
  const email = overrides.email ?? `${unique("owner")}@test.helio.dev`;
  const password = overrides.password ?? TEST_PASSWORD;
  const workspaceName = overrides.workspaceName ?? unique("Workspace");

  const res = await request(app.getHttpServer())
    .post("/auth/signup")
    .send({
      name: overrides.name ?? "Test Owner",
      email,
      password,
      workspaceName,
    })
    .expect(201);

  return {
    userId: res.body.user.id,
    email,
    password,
    workspaceId: res.body.workspace.id,
    workspaceName,
    accessToken: res.body.accessToken,
    refreshToken: res.body.refreshToken,
  };
}

/** Auth + tenant headers for workspace-scoped endpoints. */
export function authHeaders(
  accessToken: string,
  workspaceId?: string,
): Record<string, string> {
  return {
    Authorization: `Bearer ${accessToken}`,
    ...(workspaceId ? { "x-workspace-id": workspaceId } : {}),
  };
}

export interface VisitorContext {
  visitorId: string;
  visitorToken: string;
}

/** Opens a widget visitor session for a workspace (public endpoint). */
export async function createVisitorSession(
  app: INestApplication,
  workspaceId: string,
  visitorId: string = randomUUID(),
): Promise<VisitorContext> {
  const res = await request(app.getHttpServer())
    .post("/widget/session")
    .send({ workspaceId, visitorId })
    // find-or-create endpoint: deliberately 200, not 201
    .expect(200);
  return { visitorId, visitorToken: res.body.visitorToken };
}

/**
 * Sends a visitor message; the API lazily creates contact + conversation
 * on first message, so this doubles as the conversation factory.
 */
export async function sendVisitorMessage(
  app: INestApplication,
  visitorToken: string,
  content: string,
): Promise<{ id: string; conversationId: string }> {
  const res = await request(app.getHttpServer())
    .post("/widget/messages")
    .set("Authorization", `Bearer ${visitorToken}`)
    .send({ content })
    .expect(201);
  return { id: res.body.id, conversationId: res.body.conversationId };
}

/** Owner + one open conversation with a single visitor message. */
export async function createConversationFixture(app: INestApplication) {
  const owner = await signupOwner(app);
  const visitor = await createVisitorSession(app, owner.workspaceId);
  const message = await sendVisitorMessage(
    app,
    visitor.visitorToken,
    "Hello from a test visitor",
  );
  return { owner, visitor, conversationId: message.conversationId, message };
}
