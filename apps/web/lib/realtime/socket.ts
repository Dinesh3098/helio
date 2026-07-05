import { io, type Socket } from "socket.io-client";
import { BASE_URL } from "@/lib/api/client";
import { tokenStore } from "@/lib/auth/token-store";
import type { Message } from "@/types/api";

/** Wire protocol — mirror of apps/api/src/realtime/realtime.events.ts. */
export const REALTIME = {
  joinConversation: "joinConversation",
  leaveConversation: "leaveConversation",
  sendMessage: "sendMessage",
  typingStart: "typingStart",
  typingStop: "typingStop",
  conversationJoined: "conversationJoined",
  conversationLeft: "conversationLeft",
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

export type SendMessageAck = { message: Message } | { error: string };

let socket: Socket | null = null;

/**
 * Lazy singleton. The auth callback re-reads the token store on every
 * (re)connect attempt, so reconnections after a token refresh pick up the
 * fresh access token automatically.
 */
export function getSocket(): Socket {
  socket ??= io(BASE_URL, {
    autoConnect: false,
    auth: (cb) => cb({ token: tokenStore.getAccessToken() }),
  });
  return socket;
}

export function connectSocket(): Socket {
  const s = getSocket();
  if (!s.connected) s.connect();
  return s;
}

export function disconnectSocket(): void {
  socket?.disconnect();
}
