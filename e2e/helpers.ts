import { expect, type Page } from "@playwright/test";
import { randomUUID } from "node:crypto";

export const API_URL = process.env.E2E_API_URL ?? "http://localhost:4001";

export const PASSWORD = "E2e!Str0ngPassw0rd";

export interface E2eOwner {
  name: string;
  email: string;
  password: string;
  workspaceId: string;
  workspaceName: string;
  accessToken: string;
}

/** Provision a tenant through the API — fast, and keeps UI tests focused. */
export async function apiSignup(): Promise<E2eOwner> {
  const suffix = randomUUID().slice(0, 8);
  const body = {
    name: `E2E Owner ${suffix}`,
    email: `e2e-${suffix}@test.helio.dev`,
    password: PASSWORD,
    workspaceName: `E2E Workspace ${suffix}`,
  };
  const res = await fetch(`${API_URL}/auth/signup`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`signup failed: ${res.status}`);
  const data = (await res.json()) as {
    workspace: { id: string };
    accessToken: string;
  };
  return {
    ...body,
    workspaceId: data.workspace.id,
    accessToken: data.accessToken,
  };
}

/** Log in through the real UI and land on the dashboard. */
export async function uiLogin(page: Page, owner: E2eOwner): Promise<void> {
  await page.goto("/login");
  await page.getByLabel(/email/i).fill(owner.email);
  await page.getByLabel(/password/i).fill(owner.password);
  await page.getByRole("button", { name: /log in|sign in/i }).click();
  await expect(page).toHaveURL(/inbox|dashboard|\/$/, { timeout: 15_000 });
}
