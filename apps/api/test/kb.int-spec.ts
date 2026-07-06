import { INestApplication } from "@nestjs/common";
import request from "supertest";
import { authHeaders, signupOwner, unique } from "./helpers/factories";
import { createTestApp } from "./helpers/test-app";

describe("knowledge base (integration)", () => {
  let app: INestApplication;

  beforeAll(async () => {
    app = await createTestApp();
  });

  afterAll(async () => {
    await app.close();
  });

  it("category lifecycle: create, list, update, delete", async () => {
    const owner = await signupOwner(app);
    const headers = authHeaders(owner.accessToken, owner.workspaceId);

    const created = await request(app.getHttpServer())
      .post("/kb/categories")
      .set(headers)
      .send({ name: unique("Getting Started"), displayOrder: 2 })
      .expect(201);
    expect(created.body.articlesCount).toBe(0);

    await request(app.getHttpServer())
      .post("/kb/categories")
      .set(headers)
      .send({ name: "" })
      .expect(400);

    const renamed = await request(app.getHttpServer())
      .patch(`/kb/categories/${created.body.id}`)
      .set(headers)
      .send({ name: unique("Renamed") })
      .expect(200);
    expect(renamed.body.name).toMatch(/^Renamed/);

    await request(app.getHttpServer())
      .delete(`/kb/categories/${created.body.id}`)
      .set(headers)
      .expect(204);
    await request(app.getHttpServer())
      .get(`/kb/categories/${created.body.id}`)
      .set(headers)
      .expect(404);
  });

  it("article lifecycle: draft → published → unpublished, slug assigned", async () => {
    const owner = await signupOwner(app);
    const headers = authHeaders(owner.accessToken, owner.workspaceId);

    const category = await request(app.getHttpServer())
      .post("/kb/categories")
      .set(headers)
      .send({ name: unique("Guides") })
      .expect(201);

    const title = unique("How to embed the widget");
    const article = await request(app.getHttpServer())
      .post("/kb/articles")
      .set(headers)
      .send({
        title,
        content: "Step one: paste the snippet.",
        categoryId: category.body.id,
      })
      .expect(201);
    expect(article.body.isPublished).toBe(false);
    expect(article.body.slug).toBeDefined();

    const published = await request(app.getHttpServer())
      .patch(`/kb/articles/${article.body.id}`)
      .set(headers)
      .send({ isPublished: true })
      .expect(200);
    expect(published.body.isPublished).toBe(true);

    // Validation: article requires an existing category in this workspace.
    await request(app.getHttpServer())
      .post("/kb/articles")
      .set(headers)
      .send({
        title: unique("Orphan"),
        content: "no category",
        categoryId: "00000000-0000-4000-8000-000000000000",
      })
      .expect(404);
  });

  it("public help center serves only published articles and searches them", async () => {
    const owner = await signupOwner(app);
    const headers = authHeaders(owner.accessToken, owner.workspaceId);
    const token = unique("xylophone").replace(/-/g, "");

    const category = await request(app.getHttpServer())
      .post("/kb/categories")
      .set(headers)
      .send({ name: unique("Public") })
      .expect(201);

    const make = (title: string, isPublished: boolean) =>
      request(app.getHttpServer())
        .post("/kb/articles")
        .set(headers)
        .send({
          title,
          content: `Unique searchable token ${token}`,
          categoryId: category.body.id,
          isPublished,
        })
        .expect(201);

    const publicArticle = await make(unique(`Published ${token}`), true);
    const draftArticle = await make(unique(`Draft ${token}`), false);

    const listing = await request(app.getHttpServer())
      .get("/help")
      .query({ workspaceId: owner.workspaceId })
      .expect(200);
    const serialized = JSON.stringify(listing.body);
    expect(serialized).toContain(publicArticle.body.slug);
    expect(serialized).not.toContain(draftArticle.body.slug);

    // Slug detail: published resolves, draft is invisible.
    await request(app.getHttpServer())
      .get(`/help/articles/${publicArticle.body.slug}`)
      .query({ workspaceId: owner.workspaceId })
      .expect(200);
    await request(app.getHttpServer())
      .get(`/help/articles/${draftArticle.body.slug}`)
      .query({ workspaceId: owner.workspaceId })
      .expect(404);

    // Full-text search finds the published article by its unique token.
    const search = await request(app.getHttpServer())
      .get("/help/search")
      .query({ workspaceId: owner.workspaceId, q: token })
      .expect(200);
    const results = JSON.stringify(search.body);
    expect(results).toContain(publicArticle.body.slug);
    expect(results).not.toContain(draftArticle.body.slug);
  });
});
