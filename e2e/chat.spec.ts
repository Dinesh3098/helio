import { expect, test } from "@playwright/test";
import { apiSignup, uiLogin } from "./helpers";

test.describe("Scenario 3 — customer widget chat ↔ agent inbox, realtime", () => {
  test("visitor message reaches the agent instantly; reply comes back", async ({
    browser,
  }) => {
    const owner = await apiSignup();

    // Two isolated browser contexts: the customer and the agent.
    const customerContext = await browser.newContext();
    const agentContext = await browser.newContext();
    const customer = await customerContext.newPage();
    const agent = await agentContext.newPage();

    // Agent logs into the inbox first and waits there.
    await uiLogin(agent, owner);
    await agent.goto("/inbox");

    // Customer opens the demo page with this workspace and starts a chat.
    await customer.goto(`/demo?workspace=${owner.workspaceId}`);
    await expect(customer.getByText(/chat widget active/i)).toBeVisible({
      timeout: 15_000,
    });

    // The widget lives in a shadow root under #helio-widget.
    const launcher = customer.locator("#helio-widget button").first();
    await launcher.click();

    const composer = customer
      .locator("#helio-widget textarea, #helio-widget input[type='text']")
      .first();
    await composer.fill("Hello, I need help with my order!");
    await composer.press("Enter");

    // The message reaches the agent's inbox in realtime (no reload).
    await expect(
      agent.getByText("Hello, I need help with my order!").first(),
    ).toBeVisible({ timeout: 15_000 });

    // Agent opens the conversation and replies.
    await agent.getByText("Hello, I need help with my order!").first().click();
    const agentComposer = agent.locator("textarea").first();
    await agentComposer.fill("Hi! Happy to help — what is the order number?");
    await agentComposer.press("Enter");

    // The reply appears inside the customer's widget in realtime.
    await expect(
      customer
        .locator("#helio-widget")
        .getByText(/happy to help/i)
        .first(),
    ).toBeVisible({ timeout: 15_000 });

    await customerContext.close();
    await agentContext.close();
  });
});
