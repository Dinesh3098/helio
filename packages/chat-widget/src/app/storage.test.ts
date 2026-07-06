import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getOrCreateVisitorId } from "./storage";

const UUID_V4 =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

describe("getOrCreateVisitorId", () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("mints a uuid and persists it under a workspace-scoped key", () => {
    const id = getOrCreateVisitorId("ws-1");

    expect(id).toMatch(UUID_V4);
    expect(window.localStorage.getItem("helio:visitor:ws-1")).toBe(id);
  });

  it("returns the same id on repeat visits", () => {
    const first = getOrCreateVisitorId("ws-1");
    const second = getOrCreateVisitorId("ws-1");

    expect(second).toBe(first);
  });

  it("reuses an id already stored by a previous page load", () => {
    window.localStorage.setItem("helio:visitor:ws-1", "existing-id");

    expect(getOrCreateVisitorId("ws-1")).toBe("existing-id");
  });

  it("keeps identities separate per workspace", () => {
    const a = getOrCreateVisitorId("ws-a");
    const b = getOrCreateVisitorId("ws-b");

    expect(a).not.toBe(b);
    expect(window.localStorage.getItem("helio:visitor:ws-a")).toBe(a);
    expect(window.localStorage.getItem("helio:visitor:ws-b")).toBe(b);
  });

  it("falls back to the RFC4122-style generator without crypto.randomUUID", () => {
    vi.stubGlobal("crypto", {});

    const id = getOrCreateVisitorId("ws-no-crypto");

    expect(id).toMatch(UUID_V4);
  });

  it("uses a stable in-memory id when localStorage is unavailable", () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("storage disabled");
    });

    const first = getOrCreateVisitorId("ws-1");
    const second = getOrCreateVisitorId("ws-2");

    expect(first).toMatch(UUID_V4);
    // The memory fallback is a single identity for the page lifetime.
    expect(second).toBe(first);
  });
});
