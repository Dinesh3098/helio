import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { InternalAxiosRequestConfig } from "axios";
import { AxiosHeaders } from "axios";
import { api, getApiErrorMessage } from "./client";
import { tokenStore } from "@/lib/auth/token-store";
import { useWorkspaceStore } from "@/stores/workspace-store";

/** Runs the api instance's request interceptor chain on a bare config. */
async function runRequestInterceptor(): Promise<InternalAxiosRequestConfig> {
  const config = {
    url: "/conversations",
    headers: new AxiosHeaders(),
  } as InternalAxiosRequestConfig;
  const handlers = (
    api.interceptors.request as unknown as {
      handlers: {
        fulfilled: (
          c: InternalAxiosRequestConfig,
        ) => Promise<InternalAxiosRequestConfig> | InternalAxiosRequestConfig;
      }[];
    }
  ).handlers;
  let result = config;
  for (const handler of handlers) {
    result = await handler.fulfilled(result);
  }
  return result;
}

describe("api client interceptors", () => {
  beforeEach(() => {
    tokenStore.clear();
    useWorkspaceStore.setState({ activeWorkspaceId: null });
  });

  afterEach(() => {
    tokenStore.clear();
  });

  it("attaches Authorization and x-workspace-id when available", async () => {
    tokenStore.setTokens("access-token-1", "refresh-1");
    useWorkspaceStore.getState().setActiveWorkspace("ws-7");

    const config = await runRequestInterceptor();
    expect(config.headers.Authorization).toBe("Bearer access-token-1");
    expect(config.headers["x-workspace-id"]).toBe("ws-7");
  });

  it("sends neither header when logged out with no workspace", async () => {
    const config = await runRequestInterceptor();
    expect(config.headers.Authorization).toBeUndefined();
    expect(config.headers["x-workspace-id"]).toBeUndefined();
  });
});

describe("getApiErrorMessage", () => {
  it("unwraps a NestJS string message", () => {
    const error = Object.assign(new Error("Request failed"), {
      isAxiosError: true,
      response: { data: { message: "Invalid credentials" } },
    });
    expect(getApiErrorMessage(error)).toBe("Invalid credentials");
  });

  it("takes the first entry of a validation array", () => {
    const error = Object.assign(new Error("Request failed"), {
      isAxiosError: true,
      response: { data: { message: ["email must be an email", "second"] } },
    });
    expect(getApiErrorMessage(error)).toBe("email must be an email");
  });

  it("falls back for non-axios errors", () => {
    expect(getApiErrorMessage(new Error("boom"))).toBeTruthy();
  });
});
