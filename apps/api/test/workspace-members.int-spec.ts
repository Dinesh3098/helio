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

interface MemberRow {
  id: string;
  userId: string;
  name: string;
  email: string;
  role: string;
  joinedAt: string;
}

describe("workspace members RBAC (integration)", () => {
  let app: INestApplication;

  beforeAll(async () => {
    app = await createTestApp();
  });

  afterAll(async () => {
    await app.close();
  });

  const server = () => app.getHttpServer();

  /**
   * The invite endpoint attaches an EXISTING user to the workspace — it
   * never creates accounts. Every "guest" therefore signs up first (which
   * gives them their own workspace) and is then invited into the host's.
   */
  async function invite(
    host: OwnerContext,
    email: string,
    role: "ADMIN" | "AGENT",
  ): Promise<MemberRow> {
    const res = await request(server())
      .post("/workspace/members")
      .set(authHeaders(host.accessToken, host.workspaceId))
      .send({ email, role })
      .expect(201);
    return res.body as MemberRow;
  }

  async function listMembers(
    token: string,
    workspaceId: string,
  ): Promise<MemberRow[]> {
    const res = await request(server())
      .get("/workspace/members")
      .set(authHeaders(token, workspaceId))
      .expect(200);
    return res.body as MemberRow[];
  }

  describe("listing", () => {
    it("a fresh workspace contains exactly its owner", async () => {
      const owner = await signupOwner(app);
      const members = await listMembers(owner.accessToken, owner.workspaceId);

      expect(members).toHaveLength(1);
      expect(members[0]).toMatchObject({
        userId: owner.userId,
        email: owner.email,
        role: "OWNER",
      });
      expect(members[0]?.id).toBeDefined();
      expect(members[0]?.joinedAt).toBeDefined();
    });
  });

  describe("inviting", () => {
    it("owner invites an existing user as AGENT (full response shape)", async () => {
      const host = await signupOwner(app);
      const guest = await signupOwner(app);

      const member = await invite(host, guest.email, "AGENT");
      expect(member).toMatchObject({
        userId: guest.userId,
        email: guest.email,
        role: "AGENT",
      });

      const members = await listMembers(host.accessToken, host.workspaceId);
      expect(members.map((m) => m.email)).toEqual([host.email, guest.email]);
    });

    it("404s when no user exists with the invited email", async () => {
      const host = await signupOwner(app);

      await request(server())
        .post("/workspace/members")
        .set(authHeaders(host.accessToken, host.workspaceId))
        .send({ email: `${unique("ghost")}@test.helio.dev`, role: "AGENT" })
        .expect(404);
    });

    it("409s when the user is already a member", async () => {
      const host = await signupOwner(app);
      const guest = await signupOwner(app);
      await invite(host, guest.email, "AGENT");

      await request(server())
        .post("/workspace/members")
        .set(authHeaders(host.accessToken, host.workspaceId))
        .send({ email: guest.email, role: "AGENT" })
        .expect(409);
    });

    it("400s on invalid payloads (bad email, OWNER role, unknown role)", async () => {
      const host = await signupOwner(app);
      const headers = authHeaders(host.accessToken, host.workspaceId);

      await request(server())
        .post("/workspace/members")
        .set(headers)
        .send({ email: "not-an-email", role: "AGENT" })
        .expect(400);

      // OWNER is not an invitable role — ownership never moves via invites.
      await request(server())
        .post("/workspace/members")
        .set(headers)
        .send({ email: host.email, role: "OWNER" })
        .expect(400);

      await request(server())
        .post("/workspace/members")
        .set(headers)
        .send({ email: host.email, role: "SUPERUSER" })
        .expect(400);
    });

    it("ADMIN may invite agents but not admins; AGENT may not invite at all", async () => {
      const host = await signupOwner(app);
      const admin = await signupOwner(app);
      const agent = await signupOwner(app);
      const candidate = await signupOwner(app);
      await invite(host, admin.email, "ADMIN");
      await invite(host, agent.email, "AGENT");

      // Admin inviting an agent: allowed.
      await request(server())
        .post("/workspace/members")
        .set(authHeaders(admin.accessToken, host.workspaceId))
        .send({ email: candidate.email, role: "AGENT" })
        .expect(201);

      // Admin inviting an admin: only the owner can do that.
      const other = await signupOwner(app);
      await request(server())
        .post("/workspace/members")
        .set(authHeaders(admin.accessToken, host.workspaceId))
        .send({ email: other.email, role: "ADMIN" })
        .expect(403);

      // Agent inviting anyone: blocked by the roles guard.
      await request(server())
        .post("/workspace/members")
        .set(authHeaders(agent.accessToken, host.workspaceId))
        .send({ email: other.email, role: "AGENT" })
        .expect(403);
    });
  });

  describe("role changes", () => {
    it("owner promotes AGENT to ADMIN and back", async () => {
      const host = await signupOwner(app);
      const guest = await signupOwner(app);
      const member = await invite(host, guest.email, "AGENT");

      const promoted = await request(server())
        .patch(`/workspace/members/${member.id}`)
        .set(authHeaders(host.accessToken, host.workspaceId))
        .send({ role: "ADMIN" })
        .expect(200);
      expect(promoted.body.role).toBe("ADMIN");

      const demoted = await request(server())
        .patch(`/workspace/members/${member.id}`)
        .set(authHeaders(host.accessToken, host.workspaceId))
        .send({ role: "AGENT" })
        .expect(200);
      expect(demoted.body.role).toBe("AGENT");
    });

    it("the OWNER can never be demoted (403) — sole-owner invariant holds", async () => {
      const host = await signupOwner(app);
      const admin = await signupOwner(app);
      await invite(host, admin.email, "ADMIN");

      const members = await listMembers(host.accessToken, host.workspaceId);
      const ownerRow = members.find((m) => m.role === "OWNER")!;

      // Even the owner themselves cannot change the owner role...
      await request(server())
        .patch(`/workspace/members/${ownerRow.id}`)
        .set(authHeaders(host.accessToken, host.workspaceId))
        .send({ role: "AGENT" })
        .expect(403);

      // ...and neither can an admin.
      await request(server())
        .patch(`/workspace/members/${ownerRow.id}`)
        .set(authHeaders(admin.accessToken, host.workspaceId))
        .send({ role: "AGENT" })
        .expect(403);

      // Assigning OWNER to anyone else is rejected at the DTO layer (400),
      // so ownership cannot be duplicated or transferred through this API.
      const agent = await signupOwner(app);
      const agentRow = await invite(host, agent.email, "AGENT");
      await request(server())
        .patch(`/workspace/members/${agentRow.id}`)
        .set(authHeaders(host.accessToken, host.workspaceId))
        .send({ role: "OWNER" })
        .expect(400);
    });

    it("members cannot change their own role", async () => {
      const host = await signupOwner(app);
      const admin = await signupOwner(app);
      const adminRow = await invite(host, admin.email, "ADMIN");

      await request(server())
        .patch(`/workspace/members/${adminRow.id}`)
        .set(authHeaders(admin.accessToken, host.workspaceId))
        .send({ role: "AGENT" })
        .expect(403);
    });

    it("ADMIN can only manage agents (not other admins, no promotions to admin)", async () => {
      const host = await signupOwner(app);
      const adminA = await signupOwner(app);
      const adminB = await signupOwner(app);
      const agent = await signupOwner(app);
      await invite(host, adminA.email, "ADMIN");
      const rowB = await invite(host, adminB.email, "ADMIN");
      const rowAgent = await invite(host, agent.email, "AGENT");

      // Admin demoting a fellow admin: forbidden.
      await request(server())
        .patch(`/workspace/members/${rowB.id}`)
        .set(authHeaders(adminA.accessToken, host.workspaceId))
        .send({ role: "AGENT" })
        .expect(403);

      // Admin promoting an agent to admin: owner-only.
      await request(server())
        .patch(`/workspace/members/${rowAgent.id}`)
        .set(authHeaders(adminA.accessToken, host.workspaceId))
        .send({ role: "ADMIN" })
        .expect(403);

      // Agents cannot change roles at all (roles guard).
      await request(server())
        .patch(`/workspace/members/${rowB.id}`)
        .set(authHeaders(agent.accessToken, host.workspaceId))
        .send({ role: "AGENT" })
        .expect(403);
    });

    it("400s on a malformed member id and 404s on a foreign workspace's member id", async () => {
      const host = await signupOwner(app);
      const otherHost = await signupOwner(app);
      const guest = await signupOwner(app);
      const foreignRow = await invite(otherHost, guest.email, "AGENT");

      await request(server())
        .patch("/workspace/members/not-a-uuid")
        .set(authHeaders(host.accessToken, host.workspaceId))
        .send({ role: "AGENT" })
        .expect(400);

      // A member id from another tenant is indistinguishable from a
      // nonexistent one — 404, never a cross-tenant mutation.
      await request(server())
        .patch(`/workspace/members/${foreignRow.id}`)
        .set(authHeaders(host.accessToken, host.workspaceId))
        .send({ role: "AGENT" })
        .expect(404);

      await request(server())
        .patch(`/workspace/members/${randomUUID()}`)
        .set(authHeaders(host.accessToken, host.workspaceId))
        .send({ role: "AGENT" })
        .expect(404);
    });
  });

  describe("removal", () => {
    it("removing a member revokes their access to that workspace immediately", async () => {
      const host = await signupOwner(app);
      const guest = await signupOwner(app);
      const row = await invite(host, guest.email, "AGENT");

      // Access works before removal.
      await request(server())
        .get("/workspace")
        .set(authHeaders(guest.accessToken, host.workspaceId))
        .expect(200);

      await request(server())
        .delete(`/workspace/members/${row.id}`)
        .set(authHeaders(host.accessToken, host.workspaceId))
        .expect(204);

      // Roles live in the DB, not the JWT — the very next request is denied.
      await request(server())
        .get("/workspace")
        .set(authHeaders(guest.accessToken, host.workspaceId))
        .expect(403);

      // Their own workspace is untouched.
      await request(server())
        .get("/workspace")
        .set(authHeaders(guest.accessToken, guest.workspaceId))
        .expect(200);
    });

    it("the OWNER cannot be removed, not even by themselves (403)", async () => {
      const host = await signupOwner(app);
      const admin = await signupOwner(app);
      await invite(host, admin.email, "ADMIN");

      const members = await listMembers(host.accessToken, host.workspaceId);
      const ownerRow = members.find((m) => m.role === "OWNER")!;

      await request(server())
        .delete(`/workspace/members/${ownerRow.id}`)
        .set(authHeaders(admin.accessToken, host.workspaceId))
        .expect(403);

      await request(server())
        .delete(`/workspace/members/${ownerRow.id}`)
        .set(authHeaders(host.accessToken, host.workspaceId))
        .expect(403);
    });

    it("ADMIN can remove agents but not fellow admins; AGENT cannot remove anyone", async () => {
      const host = await signupOwner(app);
      const adminA = await signupOwner(app);
      const adminB = await signupOwner(app);
      const agent = await signupOwner(app);
      await invite(host, adminA.email, "ADMIN");
      const rowB = await invite(host, adminB.email, "ADMIN");
      const rowAgent = await invite(host, agent.email, "AGENT");

      // Agent removing an admin: blocked by the roles guard.
      await request(server())
        .delete(`/workspace/members/${rowB.id}`)
        .set(authHeaders(agent.accessToken, host.workspaceId))
        .expect(403);

      // Admin removing a fellow admin: forbidden.
      await request(server())
        .delete(`/workspace/members/${rowB.id}`)
        .set(authHeaders(adminA.accessToken, host.workspaceId))
        .expect(403);

      // Admin removing an agent: allowed.
      await request(server())
        .delete(`/workspace/members/${rowAgent.id}`)
        .set(authHeaders(adminA.accessToken, host.workspaceId))
        .expect(204);
    });
  });
});
