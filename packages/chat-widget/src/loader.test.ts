import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
  type MockInstance,
} from "vitest";
import type { HelioWidgetConfig } from "./shared/config";

/**
 * The loader keeps module-level state (`initialized`, `loaderSrc`,
 * `window.Helio`), so each test imports a fresh copy via resetModules.
 */
async function loadLoader(): Promise<void> {
  vi.resetModules();
  await import("./loader");
}

const VALID_CONFIG: HelioWidgetConfig = {
  workspaceId: "ws-1",
  apiUrl: "http://api.test",
};

function getHost(): HTMLElement | null {
  return document.getElementById("helio-widget");
}

function getShadow(): ShadowRoot {
  const host = getHost();
  if (!host?.shadowRoot) throw new Error("widget host not mounted");
  return host.shadowRoot;
}

function getLauncher(): HTMLButtonElement {
  const button = getShadow().querySelector<HTMLButtonElement>(
    "button.helio-launcher",
  );
  if (!button) throw new Error("launcher button not found");
  return button;
}

function injectedScripts(): HTMLScriptElement[] {
  return [...document.head.querySelectorAll("script")];
}

describe("window.Helio.init", () => {
  let warnSpy: MockInstance;
  let errorSpy: MockInstance;

  beforeEach(() => {
    warnSpy = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    errorSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);
  });

  afterEach(() => {
    getHost()?.remove();
    for (const script of injectedScripts()) script.remove();
    delete window.Helio;
    delete window.__HELIO_MOUNT__;
    Reflect.deleteProperty(document, "currentScript");
    vi.restoreAllMocks();
  });

  it("exposes window.Helio.init when the loader script evaluates", async () => {
    await loadLoader();
    expect(typeof window.Helio?.init).toBe("function");
  });

  it("rejects an invalid config without creating the launcher", async () => {
    await loadLoader();
    expect(() =>
      window.Helio?.init({ apiUrl: "http://api.test" } as HelioWidgetConfig),
    ).toThrow(/workspaceId is required/);
    expect(getHost()).toBeNull();
  });

  it("still accepts a valid init after a rejected one", async () => {
    await loadLoader();
    expect(() => window.Helio?.init({} as HelioWidgetConfig)).toThrow();
    window.Helio?.init(VALID_CONFIG);
    expect(getHost()).not.toBeNull();
  });

  it("creates the launcher inside an open shadow root", async () => {
    await loadLoader();
    window.Helio?.init(VALID_CONFIG);

    const host = getHost();
    expect(host).not.toBeNull();
    expect(host?.shadowRoot).not.toBeNull();

    const shadow = getShadow();
    expect(shadow.querySelector("style")?.textContent).toContain(
      ".helio-launcher",
    );

    const button = getLauncher();
    expect(button.getAttribute("aria-label")).toBe("Open chat");
    expect(button.querySelector("svg")).not.toBeNull();
    // The heavy app bundle must not load before the visitor opens the chat.
    expect(injectedScripts()).toHaveLength(0);
  });

  it("ignores a second init call with a warning", async () => {
    await loadLoader();
    window.Helio?.init(VALID_CONFIG);
    window.Helio?.init(VALID_CONFIG);

    expect(document.querySelectorAll("#helio-widget")).toHaveLength(1);
    expect(warnSpy).toHaveBeenCalledWith(
      "[Helio] init() called twice — ignoring",
    );
  });

  it("injects widget-app.js lazily on the first launcher click", async () => {
    await loadLoader();
    window.Helio?.init(VALID_CONFIG);

    const button = getLauncher();
    button.click();

    const scripts = injectedScripts();
    expect(scripts).toHaveLength(1);
    // No currentScript in this environment, so the bare filename is used.
    expect(scripts[0]?.getAttribute("src")).toBe("widget-app.js");
    expect(scripts[0]?.async).toBe(true);
    expect(button.classList.contains("loading")).toBe(true);
    expect(button.querySelector('[role="status"]')).not.toBeNull();
  });

  it("derives the app bundle URL from the loader script src", async () => {
    const loaderScript = document.createElement("script");
    loaderScript.src = "https://cdn.example.com/assets/widget.js";
    Object.defineProperty(document, "currentScript", {
      value: loaderScript,
      configurable: true,
    });
    await loadLoader();
    window.Helio?.init(VALID_CONFIG);

    getLauncher().click();
    expect(injectedScripts()[0]?.getAttribute("src")).toBe(
      "https://cdn.example.com/assets/widget-app.js",
    );
  });

  it("does not inject a second script while one is loading", async () => {
    await loadLoader();
    window.Helio?.init(VALID_CONFIG);

    const button = getLauncher();
    button.click();
    button.click();
    expect(injectedScripts()).toHaveLength(1);
  });

  it("calls window.__HELIO_MOUNT__ with the normalized config and shadow root on load", async () => {
    await loadLoader();
    window.Helio?.init({
      workspaceId: "ws-1",
      apiUrl: "http://api.test/",
      socketUrl: "http://socket.test/",
    });

    const mount = vi.fn();
    window.__HELIO_MOUNT__ = mount;

    getLauncher().click();
    injectedScripts()[0]?.dispatchEvent(new Event("load"));

    expect(mount).toHaveBeenCalledTimes(1);
    expect(mount).toHaveBeenCalledWith(
      {
        workspaceId: "ws-1",
        apiUrl: "http://api.test",
        socketUrl: "http://socket.test",
      },
      getShadow(),
    );
  });

  it("does not throw when the script loads before __HELIO_MOUNT__ exists", async () => {
    await loadLoader();
    window.Helio?.init(VALID_CONFIG);

    getLauncher().click();
    expect(() =>
      injectedScripts()[0]?.dispatchEvent(new Event("load")),
    ).not.toThrow();
  });

  it("restores the launcher on script error and allows retrying", async () => {
    await loadLoader();
    window.Helio?.init(VALID_CONFIG);

    const button = getLauncher();
    button.click();
    injectedScripts()[0]?.dispatchEvent(new Event("error"));

    expect(button.classList.contains("loading")).toBe(false);
    expect(button.querySelector("svg")).not.toBeNull();
    expect(errorSpy).toHaveBeenCalledWith(
      "[Helio] failed to load the chat widget",
    );

    // The failed state is cleared, so another click injects a fresh script.
    button.click();
    expect(injectedScripts()).toHaveLength(2);
  });
});
