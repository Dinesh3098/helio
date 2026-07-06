import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { HelioWidgetConfig } from "../shared/config";
import {
  createSession,
  fetchAttachmentBlobUrl,
  fetchMessages,
  sendMessageRest,
  uploadAttachment,
} from "./api";

const config: HelioWidgetConfig = {
  workspaceId: "ws-1",
  apiUrl: "http://api.test",
};

function jsonResponse(body: unknown, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: () => Promise.resolve(body),
  } as Response;
}

describe("REST client", () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("createSession posts workspaceId and visitorId as JSON", async () => {
    const session = { visitorToken: "tok" };
    fetchMock.mockResolvedValue(jsonResponse(session));

    await expect(createSession(config, "visitor-1")).resolves.toEqual(session);

    expect(fetchMock).toHaveBeenCalledWith("http://api.test/widget/session", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ workspaceId: "ws-1", visitorId: "visitor-1" }),
    });
  });

  it("fetchMessages sends the visitor token and no cursor by default", async () => {
    const page = { data: [], nextCursor: null };
    fetchMock.mockResolvedValue(jsonResponse(page));

    await expect(fetchMessages(config, "tok")).resolves.toEqual(page);

    expect(fetchMock).toHaveBeenCalledWith("http://api.test/widget/messages", {
      headers: {
        "Content-Type": "application/json",
        Authorization: "Bearer tok",
      },
    });
  });

  it("fetchMessages URL-encodes the cursor", async () => {
    fetchMock.mockResolvedValue(jsonResponse({ data: [], nextCursor: null }));

    await fetchMessages(config, "tok", "a b/c");

    expect(fetchMock.mock.calls[0]?.[0]).toBe(
      "http://api.test/widget/messages?cursor=a%20b%2Fc",
    );
  });

  it("sendMessageRest posts content and attachmentIds with the token", async () => {
    const message = { id: "m-1" };
    fetchMock.mockResolvedValue(jsonResponse(message));

    await expect(
      sendMessageRest(config, "tok", "hello", ["att-1"]),
    ).resolves.toEqual(message);

    expect(fetchMock).toHaveBeenCalledWith("http://api.test/widget/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: "Bearer tok",
      },
      body: JSON.stringify({ content: "hello", attachmentIds: ["att-1"] }),
    });
  });

  it("surfaces the API error message on a failed response", async () => {
    fetchMock.mockResolvedValue(jsonResponse({ message: "Too long" }, 400));

    await expect(createSession(config, "v")).rejects.toThrow("Too long");
  });

  it("uses the first entry when the API returns an array of messages", async () => {
    fetchMock.mockResolvedValue(
      jsonResponse({ message: ["first problem", "second problem"] }, 422),
    );

    await expect(createSession(config, "v")).rejects.toThrow("first problem");
  });

  it("falls back to a status-based message when the error body is not JSON", async () => {
    fetchMock.mockResolvedValue({
      ok: false,
      status: 500,
      json: () => Promise.reject(new Error("bad json")),
    } as unknown as Response);

    await expect(createSession(config, "v")).rejects.toThrow(
      "Request failed (500)",
    );
  });

  it("maps network failures to a friendly message", async () => {
    fetchMock.mockRejectedValue(new TypeError("Failed to fetch"));

    await expect(createSession(config, "v")).rejects.toThrow(
      "Cannot reach the chat server",
    );
  });
});

describe("fetchAttachmentBlobUrl", () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal("fetch", fetchMock);
    URL.createObjectURL = vi.fn(() => "blob:helio/preview");
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    Reflect.deleteProperty(URL, "createObjectURL");
  });

  it("downloads the bytes with the token and returns an object URL", async () => {
    const blob = new Blob(["png-bytes"]);
    fetchMock.mockResolvedValue({
      ok: true,
      blob: () => Promise.resolve(blob),
    } as unknown as Response);

    await expect(fetchAttachmentBlobUrl(config, "tok", "att-1")).resolves.toBe(
      "blob:helio/preview",
    );

    expect(fetchMock).toHaveBeenCalledWith(
      "http://api.test/widget/attachments/att-1/download",
      { headers: { Authorization: "Bearer tok" } },
    );
    expect(URL.createObjectURL).toHaveBeenCalledWith(blob);
  });

  it("throws on a non-ok response", async () => {
    fetchMock.mockResolvedValue({ ok: false } as Response);

    await expect(
      fetchAttachmentBlobUrl(config, "tok", "att-1"),
    ).rejects.toThrow("Download failed");
  });
});

describe("uploadAttachment", () => {
  class FakeXhr {
    static instances: FakeXhr[] = [];

    upload: { onprogress: ((event: ProgressEvent) => void) | null } = {
      onprogress: null,
    };
    onload: (() => void) | null = null;
    onerror: (() => void) | null = null;
    onabort: (() => void) | null = null;
    status = 0;
    responseText = "";

    open = vi.fn();
    setRequestHeader = vi.fn();
    send = vi.fn();
    abort = vi.fn(() => this.onabort?.());

    constructor() {
      FakeXhr.instances.push(this);
    }
  }

  const file = new File(["contents"], "notes.txt", { type: "text/plain" });

  beforeEach(() => {
    FakeXhr.instances = [];
    vi.stubGlobal("XMLHttpRequest", FakeXhr);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("posts the file as multipart form data with the visitor token", () => {
    uploadAttachment(config, "tok", file, () => undefined);

    const xhr = FakeXhr.instances[0] as FakeXhr;
    expect(xhr.open).toHaveBeenCalledWith(
      "POST",
      "http://api.test/widget/attachments",
    );
    expect(xhr.setRequestHeader).toHaveBeenCalledWith(
      "Authorization",
      "Bearer tok",
    );
    const form = xhr.send.mock.calls[0]?.[0] as FormData;
    expect(form).toBeInstanceOf(FormData);
    expect(form.get("file")).toBe(file);
  });

  it("reports fractional progress and resolves the parsed response", async () => {
    const onProgress = vi.fn();
    const handle = uploadAttachment(config, "tok", file, onProgress);
    const xhr = FakeXhr.instances[0] as FakeXhr;

    xhr.upload.onprogress?.({
      lengthComputable: true,
      loaded: 50,
      total: 200,
    } as ProgressEvent);
    xhr.upload.onprogress?.({
      lengthComputable: false,
      loaded: 999,
      total: 0,
    } as ProgressEvent);

    xhr.status = 201;
    xhr.responseText = JSON.stringify({
      id: "att-1",
      filename: "notes.txt",
      size: 8,
    });
    xhr.onload?.();

    await expect(handle.promise).resolves.toEqual({
      id: "att-1",
      filename: "notes.txt",
      size: 8,
    });
    expect(onProgress).toHaveBeenCalledTimes(1);
    expect(onProgress).toHaveBeenCalledWith(0.25);
  });

  it("rejects with the server message on an error status", async () => {
    const handle = uploadAttachment(config, "tok", file, () => undefined);
    const xhr = FakeXhr.instances[0] as FakeXhr;

    xhr.status = 413;
    xhr.responseText = JSON.stringify({ message: ["File too large"] });
    xhr.onload?.();

    await expect(handle.promise).rejects.toThrow("File too large");
  });

  it("keeps a generic message when the error body is not JSON", async () => {
    const handle = uploadAttachment(config, "tok", file, () => undefined);
    const xhr = FakeXhr.instances[0] as FakeXhr;

    xhr.status = 500;
    xhr.responseText = "<html>oops</html>";
    xhr.onload?.();

    await expect(handle.promise).rejects.toThrow("Upload failed (500)");
  });

  it("rejects with 'aborted' when the upload is cancelled", async () => {
    const handle = uploadAttachment(config, "tok", file, () => undefined);
    const xhr = FakeXhr.instances[0] as FakeXhr;

    handle.abort();

    expect(xhr.abort).toHaveBeenCalled();
    await expect(handle.promise).rejects.toThrow("aborted");
  });

  it("rejects with a network message on transport error", async () => {
    const handle = uploadAttachment(config, "tok", file, () => undefined);
    const xhr = FakeXhr.instances[0] as FakeXhr;

    xhr.onerror?.();

    await expect(handle.promise).rejects.toThrow(
      "Cannot reach the chat server",
    );
  });
});
