import { INestApplication } from "@nestjs/common";
import request from "supertest";
import { authHeaders, signupOwner, unique } from "./helpers/factories";
import { createTestApp } from "./helpers/test-app";

describe("auth (integration)", () => {
  let app: INestApplication;

  beforeAll(async () => {
    app = await createTestApp();
  });

  afterAll(async () => {
    await app.close();
  });

  it("signup creates user, workspace, and a session", async () => {
    const owner = await signupOwner(app);
    expect(owner.userId).toBeDefined();
    expect(owner.workspaceId).toBeDefined();
    expect(owner.accessToken).toBeDefined();
    expect(owner.refreshToken).toBeDefined();
  });

  it("rejects signup with an invalid payload (validation pipe)", async () => {
    await request(app.getHttpServer())
      .post("/auth/signup")
      .send({ email: "not-an-email", password: "short" })
      .expect(400);
  });

  it("logs in with correct credentials and rejects wrong password", async () => {
    const owner = await signupOwner(app);

    const ok = await request(app.getHttpServer())
      .post("/auth/login")
      .send({ email: owner.email, password: owner.password })
      .expect(200);
    expect(ok.body.accessToken).toBeDefined();

    await request(app.getHttpServer())
      .post("/auth/login")
      .send({ email: owner.email, password: "Wrong!Password42" })
      .expect(401);
  });

  it("refresh rotates the refresh token", async () => {
    const owner = await signupOwner(app);

    const refreshed = await request(app.getHttpServer())
      .post("/auth/refresh")
      .send({ refreshToken: owner.refreshToken })
      .expect(200);
    expect(refreshed.body.accessToken).toBeDefined();
    expect(refreshed.body.refreshToken).toBeDefined();
    expect(refreshed.body.refreshToken).not.toBe(owner.refreshToken);

    // The old token was rotated out and must no longer work.
    await request(app.getHttpServer())
      .post("/auth/refresh")
      .send({ refreshToken: owner.refreshToken })
      .expect(401);
  });

  it("logout revokes the session", async () => {
    const owner = await signupOwner(app);

    await request(app.getHttpServer())
      .post("/auth/logout")
      .send({ refreshToken: owner.refreshToken })
      .expect(204);

    await request(app.getHttpServer())
      .post("/auth/refresh")
      .send({ refreshToken: owner.refreshToken })
      .expect(401);
  });

  it("GET /auth/me requires a valid bearer token", async () => {
    const owner = await signupOwner(app);

    const me = await request(app.getHttpServer())
      .get("/auth/me")
      .set(authHeaders(owner.accessToken))
      .expect(200);
    expect(me.body.email).toBe(owner.email);

    await request(app.getHttpServer()).get("/auth/me").expect(401);
    await request(app.getHttpServer())
      .get("/auth/me")
      .set("Authorization", `Bearer ${unique("garbage")}`)
      .expect(401);
  });
});
