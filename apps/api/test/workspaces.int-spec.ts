import { INestApplication } from "@nestjs/common";
import request from "supertest";
import { randomUUID } from "node:crypto";
import {
  authHeaders,
  signupOwner,
  unique,
  OwnerContext,
} from "./helpers/factories";
import { createTestApp } from "./helpers/test-app";

/**
 * Workspaces are only created through signup — there is no standalone
 * "create workspace" endpoint. Multi-workspace users therefore come from
 * being invited into someone else's workspace (POST /workspace/members).
 */
async function inviteInto(
  app: INestApplication,
  host: OwnerContext,
  guestEmail: string,
  role: "ADMIN" | "AGENT" = "AGENT",
): Promise<{ memberId: string }> {
  const res = await request(app.getHttpServer())
    .post("/workspace/members")
    .set(authHeaders(host.accessToken, host.workspaceId))
    .send({ email: guestEmail, role })
    .expect(201);
  return { memberId: res.body.id };
}

describe("workspaces (integration)", () => {
  let app: INestApplication;

  beforeAll(async () => {
    app = await createTestApp();
  });

  afterAll(async () => {
    await app.close();
  });

  describe("GET /workspace", () => {
    it("returns the current workspace with the x-workspace-id header", async () => {
      const owner = await signupOwner(app);

      const res = await request(app.getHttpServer())
        .get("/workspace")
        .set(authHeaders(owner.accessToken, owner.workspaceId))
        .expect(200);

      expect(res.body).toMatchObject({
        id: owner.workspaceId,
        name: owner.workspaceName,
      });
      expect(res.body.createdAt).toBeDefined();
      expect(res.body.updatedAt).toBeDefined();
    });

    it("resolves the workspace implicitly when the user has exactly one membership", async () => {
      const owner = await signupOwner(app);

      const res = await request(app.getHttpServer())
        .get("/workspace")
        .set(authHeaders(owner.accessToken))
        .expect(200);

      expect(res.body.id).toBe(owner.workspaceId);
    });

    it("requires authentication", async () => {
      await request(app.getHttpServer()).get("/workspace").expect(401);
    });
  });

  describe("PATCH /workspace (rename)", () => {
    it("lets the owner rename the workspace and persists the change", async () => {
      const owner = await signupOwner(app);
      const newName = unique("Renamed");

      const res = await request(app.getHttpServer())
        .patch("/workspace")
        .set(authHeaders(owner.accessToken, owner.workspaceId))
        .send({ name: newName })
        .expect(200);
      expect(res.body.name).toBe(newName);

      const after = await request(app.getHttpServer())
        .get("/workspace")
        .set(authHeaders(owner.accessToken, owner.workspaceId))
        .expect(200);
      expect(after.body.name).toBe(newName);
    });

    it("rejects an empty name with 400", async () => {
      const owner = await signupOwner(app);

      await request(app.getHttpServer())
        .patch("/workspace")
        .set(authHeaders(owner.accessToken, owner.workspaceId))
        .send({ name: "" })
        .expect(400);
    });

    it("rejects a missing name and unknown extra fields with 400", async () => {
      const owner = await signupOwner(app);

      await request(app.getHttpServer())
        .patch("/workspace")
        .set(authHeaders(owner.accessToken, owner.workspaceId))
        .send({})
        .expect(400);

      // forbidNonWhitelisted: unknown properties are rejected outright.
      await request(app.getHttpServer())
        .patch("/workspace")
        .set(authHeaders(owner.accessToken, owner.workspaceId))
        .send({ name: unique("Valid"), plan: "enterprise" })
        .expect(400);
    });

    it("forbids non-owners (AGENT) from renaming (403)", async () => {
      const host = await signupOwner(app);
      const guest = await signupOwner(app);
      await inviteInto(app, host, guest.email, "AGENT");

      await request(app.getHttpServer())
        .patch("/workspace")
        .set(authHeaders(guest.accessToken, host.workspaceId))
        .send({ name: unique("Hijacked") })
        .expect(403);
    });
  });

  describe("GET /workspace/mine", () => {
    it("lists all memberships with workspace name and role", async () => {
      const host = await signupOwner(app);
      const guest = await signupOwner(app);
      await inviteInto(app, host, guest.email, "AGENT");

      const res = await request(app.getHttpServer())
        .get("/workspace/mine")
        .set(authHeaders(guest.accessToken))
        .expect(200);

      expect(res.body).toHaveLength(2);
      // Ordered oldest membership first: own workspace, then the invite.
      expect(res.body[0]).toEqual({
        workspaceId: guest.workspaceId,
        name: guest.workspaceName,
        role: "OWNER",
      });
      expect(res.body[1]).toEqual({
        workspaceId: host.workspaceId,
        name: host.workspaceName,
        role: "AGENT",
      });
    });

    it("works without an x-workspace-id header even with multiple memberships", async () => {
      const host = await signupOwner(app);
      const guest = await signupOwner(app);
      await inviteInto(app, host, guest.email, "AGENT");

      // Deliberately no workspace header — this is the discovery endpoint.
      const res = await request(app.getHttpServer())
        .get("/workspace/mine")
        .set(authHeaders(guest.accessToken))
        .expect(200);
      expect(res.body.length).toBe(2);
    });

    it("requires authentication", async () => {
      await request(app.getHttpServer()).get("/workspace/mine").expect(401);
    });
  });

  describe("workspace switching via x-workspace-id", () => {
    it("the same token reaches each workspace the user belongs to", async () => {
      const host = await signupOwner(app);
      const guest = await signupOwner(app);
      await inviteInto(app, host, guest.email, "AGENT");

      const own = await request(app.getHttpServer())
        .get("/workspace")
        .set(authHeaders(guest.accessToken, guest.workspaceId))
        .expect(200);
      expect(own.body.name).toBe(guest.workspaceName);

      const other = await request(app.getHttpServer())
        .get("/workspace")
        .set(authHeaders(guest.accessToken, host.workspaceId))
        .expect(200);
      expect(other.body.name).toBe(host.workspaceName);
    });

    it("403s for a workspace the user does not belong to", async () => {
      const owner = await signupOwner(app);
      const stranger = await signupOwner(app);

      await request(app.getHttpServer())
        .get("/workspace")
        .set(authHeaders(owner.accessToken, stranger.workspaceId))
        .expect(403);
    });

    it("403s for a nonexistent or malformed workspace id", async () => {
      const owner = await signupOwner(app);

      await request(app.getHttpServer())
        .get("/workspace")
        .set(authHeaders(owner.accessToken, randomUUID()))
        .expect(403);

      await request(app.getHttpServer())
        .get("/workspace")
        .set(authHeaders(owner.accessToken, "not-a-uuid"))
        .expect(403);
    });

    it("403s without a header when the user belongs to several workspaces", async () => {
      const host = await signupOwner(app);
      const guest = await signupOwner(app);
      await inviteInto(app, host, guest.email, "AGENT");

      // Ambiguous tenant context must never be guessed.
      await request(app.getHttpServer())
        .get("/workspace")
        .set(authHeaders(guest.accessToken))
        .expect(403);
    });
  });
});
