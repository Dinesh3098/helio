import { io, type Socket } from "socket.io-client";
import type { HelioWidgetConfig } from "../shared/config";
import type { WidgetMessage } from "./types";

/** Wire protocol — mirror of apps/api/src/realtime/realtime.events.ts. */
export const EVENTS = {
  joinConversation: "joinConversation",
  leaveConversation: "leaveConversation",
  sendMessage: "sendMessage",
  typingStart: "typingStart",
  typingStop: "typingStop",
  messageCreated: "messageCreated",
  typingStarted: "typingStarted",
  typingStopped: "typingStopped",
  messageError: "messageError",
} as const;

export interface TypingEvent {
  conversationId: string;
  userId: string;
  name: string;
}

type SendAck = { message: WidgetMessage } | { error: string };

export function createSocket(
  config: HelioWidgetConfig,
  visitorToken: string,
): Socket {
  return io(config.socketUrl ?? config.apiUrl, {
    // Visitor credential — the gateway routes this through WidgetAuthService.
    auth: { visitorToken },
  });
}

export async function sendViaSocket(
  socket: Socket,
  conversationId: string,
  content: string,
): Promise<WidgetMessage> {
  const ack = (await socket
    .timeout(8000)
    .emitWithAck(EVENTS.sendMessage, { conversationId, content })) as SendAck;
  if ("error" in ack) throw new Error(ack.error);
  return ack.message;
}
