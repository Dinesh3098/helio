import { beforeEach, describe, expect, it, vi, type Mock } from "vitest";
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/preact";
import { io, type Socket } from "socket.io-client";
import type { HelioWidgetConfig } from "../shared/config";
import { createSession, fetchMessages, sendMessageRest } from "./api";
import type { WidgetMessage, WidgetSession } from "./types";
import { Widget } from "./widget";

vi.mock("socket.io-client", () => ({ io: vi.fn() }));

vi.mock("./api", () => ({
  createSession: vi.fn(),
  fetchMessages: vi.fn(),
  sendMessageRest: vi.fn(),
  uploadAttachment: vi.fn(),
  fetchAttachmentBlobUrl: vi.fn(),
}));

type Handler = (payload?: unknown) => void;

/** Minimal socket double: records emits, lets tests fire server events. */
class FakeSocket {
  connected = false;
  emitted: Array<{ event: string; payload: unknown }> = [];
  emitWithAck: Mock = vi.fn();
  removeAllListeners: Mock = vi.fn(() => {
    this.handlers.clear();
    return this;
  });
  disconnect: Mock = vi.fn(() => {
    this.connected = false;
    return this;
  });

  private readonly handlers = new Map<string, Handler[]>();

  on(event: string, handler: Handler): this {
    const list = this.handlers.get(event) ?? [];
    list.push(handler);
    this.handlers.set(event, list);
    return this;
  }

  emit(event: string, payload?: unknown): this {
    this.emitted.push({ event, payload });
    return this;
  }

  timeout(): { emitWithAck: Mock } {
    return { emitWithAck: this.emitWithAck };
  }

  fire(event: string, payload?: unknown): void {
    for (const handler of this.handlers.get(event) ?? []) handler(payload);
  }
}

const ioMock = vi.mocked(io);
const createSessionMock = vi.mocked(createSession);
const fetchMessagesMock = vi.mocked(fetchMessages);
const sendMessageRestMock = vi.mocked(sendMessageRest);

const config: HelioWidgetConfig = {
  workspaceId: "ws-1",
  apiUrl: "http://api.test",
};

function makeSession(overrides: Partial<WidgetSession> = {}): WidgetSession {
  return {
    visitorToken: "visitor-token",
    contact: { id: "contact-1", name: "Visitor" },
    conversation: { id: "conv-1", status: "OPEN" },
    workspace: { name: "Acme Support" },
    ...overrides,
  };
}

let messageSeq = 0;
function makeMessage(overrides: Partial<WidgetMessage> = {}): WidgetMessage {
  messageSeq += 1;
  return {
    id: `m-${messageSeq}`,
    conversationId: "conv-1",
    senderType: "USER",
    senderId: "agent-1",
    senderName: "Agent",
    content: `message ${messageSeq}`,
    messageType: "TEXT",
    createdAt: new Date(1750000000000 + messageSeq * 60000).toISOString(),
    ...overrides,
  };
}

let sockets: FakeSocket[] = [];

function lastSocket(): FakeSocket {
  const socket = sockets[sockets.length - 1];
  if (!socket) throw new Error("no socket was created");
  return socket;
}

async function renderReady() {
  const view = render(<Widget config={config} />);
  await waitFor(() => expect(ioMock).toHaveBeenCalled());
  return { ...view, socket: lastSocket() };
}

function getLauncher(container: Element): HTMLButtonElement {
  const button = container.querySelector<HTMLButtonElement>(".helio-launcher");
  if (!button) throw new Error("launcher not rendered");
  return button;
}

function bubbleTexts(container: Element): string[] {
  return [...container.querySelectorAll(".helio-bubble")].map(
    (el) => el.textContent ?? "",
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  sockets = [];
  ioMock.mockImplementation(() => {
    const socket = new FakeSocket();
    sockets.push(socket);
    return socket as unknown as Socket;
  });
  createSessionMock.mockResolvedValue(makeSession());
  fetchMessagesMock.mockResolvedValue({ data: [], nextCursor: null });
});

describe("Widget boot", () => {
  it("connects the socket with the visitor token and joins the conversation", async () => {
    const { socket } = await renderReady();

    expect(ioMock).toHaveBeenCalledWith("http://api.test", {
      auth: { visitorToken: "visitor-token" },
    });

    await act(async () => {
      socket.fire("connect");
    });

    expect(socket.emitted).toContainEqual({
      event: "joinConversation",
      payload: { conversationId: "conv-1" },
    });
    // First connect must not trigger a recovery fetch.
    expect(fetchMessagesMock).toHaveBeenCalledTimes(1);
  });

  it("renders fetched history sorted by createdAt", async () => {
    const older = makeMessage({ content: "first" });
    const newer = makeMessage({ content: "second" });
    fetchMessagesMock.mockResolvedValue({
      data: [newer, older],
      nextCursor: null,
    });

    const { container } = await renderReady();

    await screen.findByText("second");
    expect(bubbleTexts(container)).toEqual(["first", "second"]);
    expect(screen.getByText("Acme Support")).toBeTruthy();
  });

  it("shows the error state and retries boot on demand", async () => {
    createSessionMock.mockRejectedValueOnce(new Error("network down"));

    await act(async () => {
      render(<Widget config={config} />);
    });

    await screen.findByText("We couldn't start the chat");
    expect(ioMock).not.toHaveBeenCalled();

    fireEvent.click(screen.getByText("Try again"));

    await screen.findByLabelText("Message");
    expect(ioMock).toHaveBeenCalledTimes(1);
  });
});

describe("Widget realtime handlers", () => {
  it("appends messageCreated events to the thread", async () => {
    const { socket } = await renderReady();

    await act(async () => {
      socket.fire("messageCreated", makeMessage({ content: "hi from agent" }));
    });

    expect(await screen.findByText("hi from agent")).toBeTruthy();
  });

  it("shows and clears the typing indicator", async () => {
    const { socket, container } = await renderReady();

    await act(async () => {
      socket.fire("typingStarted", {
        conversationId: "conv-1",
        userId: "agent-1",
        name: "Alice",
      });
    });
    expect(
      container.querySelector('[aria-label="Alice is typing"]'),
    ).toBeTruthy();

    await act(async () => {
      socket.fire("typingStopped", {
        conversationId: "conv-1",
        userId: "agent-1",
        name: "Alice",
      });
    });
    expect(
      container.querySelector('[aria-label="Alice is typing"]'),
    ).toBeNull();
  });

  it("ignores typing events for other conversations", async () => {
    const { socket, container } = await renderReady();

    await act(async () => {
      socket.fire("typingStarted", {
        conversationId: "other-conv",
        userId: "agent-1",
        name: "Alice",
      });
    });

    expect(
      container.querySelector('[aria-label="Alice is typing"]'),
    ).toBeNull();
  });

  it("clears the sender's typing indicator when their message arrives", async () => {
    const { socket, container } = await renderReady();

    await act(async () => {
      socket.fire("typingStarted", {
        conversationId: "conv-1",
        userId: "agent-1",
        name: "Alice",
      });
      socket.fire("messageCreated", makeMessage({ senderId: "agent-1" }));
    });

    expect(
      container.querySelector('[aria-label="Alice is typing"]'),
    ).toBeNull();
  });

  it("counts unread agent messages while minimized and clears on reopen", async () => {
    const { socket, container } = await renderReady();
    const launcher = getLauncher(container);

    // Open panel: incoming agent messages are read immediately.
    await act(async () => {
      socket.fire("messageCreated", makeMessage());
    });
    expect(container.querySelector(".helio-unread")).toBeNull();

    fireEvent.click(launcher); // minimize

    await act(async () => {
      socket.fire("messageCreated", makeMessage());
      socket.fire("messageCreated", makeMessage());
    });
    expect(container.querySelector(".helio-unread")?.textContent).toBe("2");

    // Visitor's own echoes never count as unread.
    await act(async () => {
      socket.fire(
        "messageCreated",
        makeMessage({ senderType: "CONTACT", senderId: "contact-1" }),
      );
    });
    expect(container.querySelector(".helio-unread")?.textContent).toBe("2");

    await act(async () => {
      for (let i = 0; i < 8; i += 1) {
        socket.fire("messageCreated", makeMessage());
      }
    });
    expect(container.querySelector(".helio-unread")?.textContent).toBe("9+");

    fireEvent.click(launcher); // reopen
    expect(container.querySelector(".helio-unread")).toBeNull();
  });

  it("refetches history on reconnect and dedupes by id", async () => {
    const existing = makeMessage({ content: "already here" });
    const missed = makeMessage({ content: "missed while offline" });
    fetchMessagesMock
      .mockResolvedValueOnce({ data: [existing], nextCursor: null }) // boot
      .mockResolvedValueOnce({ data: [existing, missed], nextCursor: null }); // recovery

    const { socket, container } = await renderReady();
    await screen.findByText("already here");

    await act(async () => {
      socket.fire("connect"); // first connect: no recovery fetch
      socket.fire("connect"); // reconnect: recovery fetch + merge
    });

    await screen.findByText("missed while offline");
    expect(fetchMessagesMock).toHaveBeenCalledTimes(2);
    expect(fetchMessagesMock).toHaveBeenLastCalledWith(config, "visitor-token");
    expect(bubbleTexts(container)).toEqual([
      "already here",
      "missed while offline",
    ]);
  });

  it("removes listeners and disconnects the socket on unmount", async () => {
    const { socket, unmount } = await renderReady();

    unmount();

    expect(socket.removeAllListeners).toHaveBeenCalled();
    expect(socket.disconnect).toHaveBeenCalled();
  });
});

describe("Widget send flow", () => {
  async function typeAndSend(content: string) {
    const textarea = await screen.findByLabelText("Message");
    fireEvent.input(textarea, { target: { value: content } });
    fireEvent.keyDown(textarea, { key: "Enter" });
  }

  it("sends via the socket when connected and swaps in the acked message", async () => {
    const { socket, container } = await renderReady();
    socket.connected = true;

    let resolveAck!: (value: unknown) => void;
    socket.emitWithAck.mockReturnValue(
      new Promise((resolve) => {
        resolveAck = resolve;
      }),
    );

    await typeAndSend("hello there");

    // Optimistic bubble while the ack is pending.
    expect(await screen.findByText("Sending…")).toBeTruthy();
    expect(socket.emitWithAck).toHaveBeenCalledWith("sendMessage", {
      conversationId: "conv-1",
      content: "hello there",
      attachmentIds: [],
    });
    expect(sendMessageRestMock).not.toHaveBeenCalled();

    const acked = makeMessage({
      senderType: "CONTACT",
      senderId: "contact-1",
      content: "hello there",
    });
    await act(async () => {
      resolveAck({ message: acked });
    });

    await waitFor(() => {
      expect(screen.queryByText("Sending…")).toBeNull();
    });
    // The local optimistic copy is replaced, not duplicated.
    expect(
      bubbleTexts(container).filter((text) => text === "hello there"),
    ).toHaveLength(1);
  });

  it("falls back to REST when the socket is disconnected", async () => {
    const { socket } = await renderReady();
    socket.connected = false;
    sendMessageRestMock.mockResolvedValue(
      makeMessage({
        senderType: "CONTACT",
        senderId: "contact-1",
        content: "offline message",
      }),
    );

    await typeAndSend("offline message");

    await waitFor(() => {
      expect(sendMessageRestMock).toHaveBeenCalledWith(
        config,
        "visitor-token",
        "offline message",
        [],
      );
    });
    expect(socket.emitWithAck).not.toHaveBeenCalled();
    await waitFor(() => {
      expect(screen.queryByText("Sending…")).toBeNull();
    });
    expect(screen.getByText("offline message")).toBeTruthy();
  });

  it("marks a failed send and retries it on request", async () => {
    await renderReady();
    sendMessageRestMock.mockRejectedValueOnce(new Error("boom"));

    await typeAndSend("fragile");

    const retry = await screen.findByText("Failed — retry");

    sendMessageRestMock.mockResolvedValueOnce(
      makeMessage({
        senderType: "CONTACT",
        senderId: "contact-1",
        content: "fragile",
      }),
    );
    fireEvent.click(retry);

    await waitFor(() => {
      expect(screen.queryByText("Failed — retry")).toBeNull();
    });
    expect(sendMessageRestMock).toHaveBeenCalledTimes(2);
    expect(screen.getByText("fragile")).toBeTruthy();
  });

  it("starts a fresh session and redelivers when the conversation was resolved", async () => {
    await renderReady();

    const freshSession = makeSession({
      visitorToken: "fresh-token",
      conversation: { id: "conv-2", status: "OPEN" },
    });
    createSessionMock.mockResolvedValueOnce(freshSession);
    sendMessageRestMock
      .mockRejectedValueOnce(new Error("Conversation is resolved"))
      .mockResolvedValueOnce(
        makeMessage({
          conversationId: "conv-2",
          senderType: "CONTACT",
          senderId: "contact-1",
          content: "second life",
        }),
      );

    await typeAndSend("second life");

    await waitFor(() => {
      expect(sendMessageRestMock).toHaveBeenCalledTimes(2);
    });
    // Redelivery targets the fresh conversation's token.
    expect(sendMessageRestMock).toHaveBeenLastCalledWith(
      config,
      "fresh-token",
      "second life",
      undefined,
    );
    expect(createSessionMock).toHaveBeenCalledTimes(2);
    expect(await screen.findByText("second life")).toBeTruthy();
  });
});
