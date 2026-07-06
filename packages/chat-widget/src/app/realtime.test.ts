import { beforeEach, describe, expect, it, vi } from "vitest";
import { io, type Socket } from "socket.io-client";
import { createSocket, EVENTS, sendViaSocket } from "./realtime";
import type { WidgetMessage } from "./types";

vi.mock("socket.io-client", () => ({ io: vi.fn() }));

const ioMock = vi.mocked(io);

describe("createSocket", () => {
  beforeEach(() => {
    ioMock.mockReset();
  });

  it("connects to apiUrl with the visitor token as auth", () => {
    const fakeSocket = { id: "fake" } as unknown as Socket;
    ioMock.mockReturnValue(fakeSocket);

    const socket = createSocket(
      { workspaceId: "ws-1", apiUrl: "http://api.test" },
      "visitor-token",
    );

    expect(ioMock).toHaveBeenCalledTimes(1);
    expect(ioMock).toHaveBeenCalledWith("http://api.test", {
      auth: { visitorToken: "visitor-token" },
    });
    expect(socket).toBe(fakeSocket);
  });

  it("prefers socketUrl over apiUrl when configured", () => {
    createSocket(
      {
        workspaceId: "ws-1",
        apiUrl: "http://api.test",
        socketUrl: "http://socket.test",
      },
      "tok",
    );

    expect(ioMock).toHaveBeenCalledWith("http://socket.test", {
      auth: { visitorToken: "tok" },
    });
  });
});

describe("sendViaSocket", () => {
  function fakeSocketWithAck(ack: unknown) {
    const emitWithAck = vi.fn().mockResolvedValue(ack);
    const timeout = vi.fn().mockReturnValue({ emitWithAck });
    return {
      socket: { timeout } as unknown as Socket,
      emitWithAck,
      timeout,
    };
  }

  const message: WidgetMessage = {
    id: "m-1",
    conversationId: "conv-1",
    senderType: "CONTACT",
    senderId: "contact-1",
    senderName: "Visitor",
    content: "hello",
    messageType: "TEXT",
    createdAt: "2026-07-06T00:00:00.000Z",
  };

  it("emits sendMessage with an 8s ack timeout and resolves the message", async () => {
    const { socket, emitWithAck, timeout } = fakeSocketWithAck({ message });

    const result = await sendViaSocket(socket, "conv-1", "hello", ["att-1"]);

    expect(timeout).toHaveBeenCalledWith(8000);
    expect(emitWithAck).toHaveBeenCalledWith(EVENTS.sendMessage, {
      conversationId: "conv-1",
      content: "hello",
      attachmentIds: ["att-1"],
    });
    expect(result).toBe(message);
  });

  it("passes attachmentIds through as undefined when omitted", async () => {
    const { socket, emitWithAck } = fakeSocketWithAck({ message });

    await sendViaSocket(socket, "conv-1", "hello");

    expect(emitWithAck).toHaveBeenCalledWith(EVENTS.sendMessage, {
      conversationId: "conv-1",
      content: "hello",
      attachmentIds: undefined,
    });
  });

  it("throws when the server acks with an error", async () => {
    const { socket } = fakeSocketWithAck({ error: "Conversation is resolved" });

    await expect(sendViaSocket(socket, "conv-1", "hello")).rejects.toThrow(
      "Conversation is resolved",
    );
  });
});
