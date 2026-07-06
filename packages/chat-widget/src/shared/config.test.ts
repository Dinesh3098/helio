import { describe, expect, it } from "vitest";
import { validateConfig } from "./config";

describe("validateConfig", () => {
  it("accepts a complete config and strips trailing slashes", () => {
    expect(
      validateConfig({
        workspaceId: "ws-1",
        apiUrl: "https://api.example.com/",
        socketUrl: "https://socket.example.com/",
      }),
    ).toEqual({
      workspaceId: "ws-1",
      apiUrl: "https://api.example.com",
      socketUrl: "https://socket.example.com",
    });
  });

  it("leaves socketUrl undefined when not provided", () => {
    const config = validateConfig({ workspaceId: "ws", apiUrl: "http://a" });
    expect(config.socketUrl).toBeUndefined();
  });

  it.each([undefined, null, "string", 42])(
    "rejects non-object input: %p",
    (input) => {
      expect(() => validateConfig(input)).toThrow(/options object/);
    },
  );

  it("rejects a missing workspaceId", () => {
    expect(() => validateConfig({ apiUrl: "http://a" })).toThrow(
      /workspaceId is required/,
    );
  });

  it("rejects a missing apiUrl", () => {
    expect(() => validateConfig({ workspaceId: "ws" })).toThrow(
      /apiUrl is required/,
    );
  });
});
