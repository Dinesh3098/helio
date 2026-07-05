import type { HelioWidgetConfig } from "../shared/config";
import type { MessagesPage, WidgetMessage, WidgetSession } from "./types";

/** fetch-based REST client — axios would double the bundle for nothing. */

async function request<T>(
  config: HelioWidgetConfig,
  path: string,
  init: RequestInit = {},
): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`${config.apiUrl}${path}`, {
      ...init,
      headers: { "Content-Type": "application/json", ...init.headers },
    });
  } catch {
    throw new Error("Cannot reach the chat server");
  }

  if (!response.ok) {
    const body = (await response.json().catch(() => null)) as {
      message?: string | string[];
    } | null;
    const message = Array.isArray(body?.message)
      ? body.message[0]
      : body?.message;
    throw new Error(message ?? `Request failed (${response.status})`);
  }
  return response.json() as Promise<T>;
}

export function createSession(
  config: HelioWidgetConfig,
  visitorId: string,
): Promise<WidgetSession> {
  return request<WidgetSession>(config, "/widget/session", {
    method: "POST",
    body: JSON.stringify({ workspaceId: config.workspaceId, visitorId }),
  });
}

export function fetchMessages(
  config: HelioWidgetConfig,
  visitorToken: string,
  cursor?: string,
): Promise<MessagesPage> {
  const query = cursor ? `?cursor=${encodeURIComponent(cursor)}` : "";
  return request<MessagesPage>(config, `/widget/messages${query}`, {
    headers: { Authorization: `Bearer ${visitorToken}` },
  });
}

/** REST fallback used when the socket is not connected. */
export function sendMessageRest(
  config: HelioWidgetConfig,
  visitorToken: string,
  content: string,
): Promise<WidgetMessage> {
  return request<WidgetMessage>(config, "/widget/messages", {
    method: "POST",
    headers: { Authorization: `Bearer ${visitorToken}` },
    body: JSON.stringify({ content }),
  });
}
