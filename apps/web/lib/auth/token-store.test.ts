import { beforeEach, describe, expect, it } from "vitest";
import { tokenStore } from "./token-store";

describe("tokenStore", () => {
  beforeEach(() => {
    tokenStore.clear();
    window.localStorage.clear();
  });

  it("holds the access token in memory and the refresh token in localStorage", () => {
    tokenStore.setTokens("access-abc", "refresh-xyz");
    expect(tokenStore.getAccessToken()).toBe("access-abc");
    expect(tokenStore.getRefreshToken()).toBe("refresh-xyz");
    expect(window.localStorage.getItem("helio.refresh-token")).toBe(
      "refresh-xyz",
    );
    // Access token is never persisted — reloads must re-acquire it.
    expect(
      Object.keys(window.localStorage).some((k) =>
        (window.localStorage.getItem(k) ?? "").includes("access-abc"),
      ),
    ).toBe(false);
  });

  it("clear() wipes both tokens", () => {
    tokenStore.setTokens("a", "r");
    tokenStore.clear();
    expect(tokenStore.getAccessToken()).toBeNull();
    expect(tokenStore.getRefreshToken()).toBeNull();
  });
});
