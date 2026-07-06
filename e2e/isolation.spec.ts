import { expect, test } from "@playwright/test";
import { API_URL, apiSignup, uiLogin } from "./helpers";

test.describe("Scenario 9 — tenant isolation through the UI", () => {
  test("a second tenant's dashboard shows none of the first tenant's data", async ({
    browser,
  }) => {
    const ownerA = await apiSignup();
    const ownerB = await apiSignup();

    // Tenant A gets a distinctive conversation via the widget API.
    const session = await (
      await fetch(`${API_URL}/widget/session`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          workspaceId: ownerA.workspaceId,
          visitorId: crypto.randomUUID(),
        }),
      })
    ).json();
    const secret = `TENANT-A-SECRET-${crypto.randomUUID().slice(0, 8)}`;
    await fetch(`${API_URL}/widget/messages`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${session.visitorToken}`,
      },
      body: JSON.stringify({ content: secret }),
    });

    // A sees it; B never does.
    const contextA = await browser.newContext();
    const pageA = await contextA.newPage();
    await uiLogin(pageA, ownerA);
    await pageA.goto("/inbox");
    await expect(pageA.getByText(secret).first()).toBeVisible({
      timeout: 15_000,
    });
    await contextA.close();

    const contextB = await browser.newContext();
    const pageB = await contextB.newPage();
    await uiLogin(pageB, ownerB);
    await pageB.goto("/inbox");
    await expect(pageB.getByText(ownerB.workspaceName).first()).toBeVisible();
    await expect(pageB.getByText(secret)).toHaveCount(0);
    await contextB.close();
  });
});
