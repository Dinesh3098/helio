import { expect, test } from "@playwright/test";
import { randomUUID } from "node:crypto";
import { apiSignup, PASSWORD, uiLogin } from "./helpers";

test.describe("Scenario 1 — owner signup, workspace creation, login", () => {
  test("signs up through the UI and lands in the inbox", async ({ page }) => {
    const suffix = randomUUID().slice(0, 8);

    await page.goto("/signup");
    // Field order on the form: workspace name first, then full name.
    await page.getByLabel(/workspace name/i).fill(`Signup Workspace ${suffix}`);
    await page.getByLabel(/full name/i).fill(`E2E Signup ${suffix}`);
    await page.getByLabel(/email/i).fill(`e2e-ui-${suffix}@test.helio.dev`);
    await page.getByLabel(/password/i).fill(PASSWORD);
    await page.getByRole("button", { name: /sign up|create/i }).click();

    await expect(page).toHaveURL(/inbox/, { timeout: 15_000 });
    await expect(
      page.getByText(new RegExp(`Signup Workspace ${suffix}`, "i")).first(),
    ).toBeVisible();
  });

  test("rejects a wrong password on login", async ({ page }) => {
    const owner = await apiSignup();

    await page.goto("/login");
    await page.getByLabel(/email/i).fill(owner.email);
    await page.getByLabel(/password/i).fill("Wrong!Password42");
    await page.getByRole("button", { name: /log in|sign in/i }).click();

    await expect(
      page.getByText(/invalid|incorrect|credentials/i),
    ).toBeVisible();
    await expect(page).toHaveURL(/login/);
  });

  test("logs in and reaches the dashboard", async ({ page }) => {
    const owner = await apiSignup();
    await uiLogin(page, owner);
    await expect(page.getByText(owner.workspaceName).first()).toBeVisible();
  });
});
