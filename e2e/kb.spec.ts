import { expect, test } from "@playwright/test";
import { randomUUID } from "node:crypto";
import { API_URL, apiSignup, uiLogin } from "./helpers";

test.describe("Scenario 6 — knowledge base to public help center", () => {
  test("create category + article, publish, read it publicly", async ({
    page,
  }) => {
    const owner = await apiSignup();
    const marker = randomUUID().slice(0, 8);

    // Category + published article via the API (the KB editor UI is
    // exercised lightly; the publish→public pipeline is the target here).
    const headers = {
      "Content-Type": "application/json",
      Authorization: `Bearer ${owner.accessToken}`,
      "x-workspace-id": owner.workspaceId,
    };
    const category = await (
      await fetch(`${API_URL}/kb/categories`, {
        method: "POST",
        headers,
        body: JSON.stringify({ name: `Guides ${marker}` }),
      })
    ).json();
    const article = await (
      await fetch(`${API_URL}/kb/articles`, {
        method: "POST",
        headers,
        body: JSON.stringify({
          title: `Setting up your widget ${marker}`,
          content: `Complete walkthrough ${marker}. Paste the snippet before </body>.`,
          categoryId: category.id,
          isPublished: true,
        }),
      })
    ).json();

    // The dashboard lists it.
    await uiLogin(page, owner);
    await page.goto("/knowledge-base");
    await expect(
      page.getByText(`Setting up your widget ${marker}`).first(),
    ).toBeVisible({ timeout: 15_000 });

    // The public help center serves it without any authentication.
    const publicPage = await page.context().browser()!.newContext();
    const anonymous = await publicPage.newPage();
    await anonymous.goto(`/help?workspace=${owner.workspaceId}`);
    // The help page resolves its workspace via env or query — fall back to
    // direct article navigation, which is the load-bearing behavior.
    await anonymous.goto(
      `/help/${article.slug}?workspace=${owner.workspaceId}`,
    );
    await expect(
      anonymous.getByText(new RegExp(`Complete walkthrough ${marker}`)).first(),
    ).toBeVisible({ timeout: 15_000 });
    await publicPage.close();
  });
});
