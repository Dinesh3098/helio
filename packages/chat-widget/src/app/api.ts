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
  attachmentIds?: string[],
): Promise<WidgetMessage> {
  return request<WidgetMessage>(config, "/widget/messages", {
    method: "POST",
    headers: { Authorization: `Bearer ${visitorToken}` },
    body: JSON.stringify({ content, attachmentIds }),
  });
}


export interface UploadHandle {
  promise: Promise<{ id: string; filename: string; size: number }>;
  abort: () => void;
}

/**
 * XMLHttpRequest instead of fetch: upload progress events don't exist on
 * fetch, and the widget must show real per-file progress.
 */
export function uploadAttachment(
  config: HelioWidgetConfig,
  visitorToken: string,
  file: File,
  onProgress: (fraction: number) => void,
): UploadHandle {
  const xhr = new XMLHttpRequest();
  const promise = new Promise<{ id: string; filename: string; size: number }>(
    (resolve, reject) => {
      xhr.open("POST", `${config.apiUrl}/widget/attachments`);
      xhr.setRequestHeader("Authorization", `Bearer ${visitorToken}`);
      xhr.upload.onprogress = (event) => {
        if (event.lengthComputable) onProgress(event.loaded / event.total);
      };
      xhr.onload = () => {
        if (xhr.status >= 200 && xhr.status < 300) {
          resolve(JSON.parse(xhr.responseText));
        } else {
          let message = `Upload failed (${xhr.status})`;
          try {
            const body = JSON.parse(xhr.responseText);
            if (body.message) {
              message = Array.isArray(body.message)
                ? body.message[0]
                : body.message;
            }
          } catch {
            // keep the generic message
          }
          reject(new Error(message));
        }
      };
      xhr.onerror = () => reject(new Error("Cannot reach the chat server"));
      xhr.onabort = () => reject(new Error("aborted"));
      const form = new FormData();
      form.append("file", file);
      xhr.send(form);
    },
  );
  return { promise, abort: () => xhr.abort() };
}

/** Downloads need the visitor token header, so bytes come via blob. */
export async function fetchAttachmentBlobUrl(
  config: HelioWidgetConfig,
  visitorToken: string,
  attachmentId: string,
): Promise<string> {
  const response = await fetch(
    `${config.apiUrl}/widget/attachments/${attachmentId}/download`,
    { headers: { Authorization: `Bearer ${visitorToken}` } },
  );
  if (!response.ok) throw new Error("Download failed");
  return URL.createObjectURL(await response.blob());
}
