"use client";

import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import {
  connectSocket,
  disconnectSocket,
  getSocket,
  REALTIME,
  type TypingEvent,
} from "@/lib/realtime/socket";
import { useUiStore } from "@/stores/ui-store";
import type { Message } from "@/types/api";
import {
  appendMessageToCache,
  applyMessageToConversationCaches,
} from "./cache";

/**
 * Owns the socket connection for the session. Mounted once in the
 * dashboard layout, after authentication resolves.
 */
export function useRealtimeConnection(userId: string | undefined): void {
  useEffect(() => {
    if (!userId) return;
    connectSocket();
    return () => disconnectSocket();
  }, [userId]);
}

/**
 * Joins the conversation's room while mounted (rejoining after every
 * reconnect), leaves on close, and folds incoming events into the React
 * Query caches — no refetching. Returns who is currently typing.
 */
export function useConversationRoom(conversationId: string | null): {
  typingNames: string[];
} {
  const queryClient = useQueryClient();
  const [typingUsers, setTypingUsers] = useState<Record<string, string>>({});

  useEffect(() => {
    setTypingUsers({});
    if (!conversationId) return;

    const socket = getSocket();
    const join = () =>
      socket.emit(REALTIME.joinConversation, { conversationId });
    if (socket.connected) join();
    socket.on("connect", join);

    const removeTyping = (userId: string) =>
      setTypingUsers((current) => {
        if (!(userId in current)) return current;
        const next = { ...current };
        delete next[userId];
        return next;
      });

    const onMessageCreated = (message: Message) => {
      applyMessageToConversationCaches(queryClient, message);
      if (message.conversationId === conversationId) {
        appendMessageToCache(queryClient, message);
        if (message.senderId) removeTyping(message.senderId);
      } else {
        // Not the open thread: preview/timestamps were updated above;
        // surface it as an unread badge only.
        useUiStore.getState().incrementUnread(message.conversationId);
      }
    };

    const onTypingStarted = (event: TypingEvent) => {
      if (event.conversationId !== conversationId) return;
      setTypingUsers((current) => ({ ...current, [event.userId]: event.name }));
    };

    const onTypingStopped = (event: TypingEvent) => {
      if (event.conversationId !== conversationId) return;
      removeTyping(event.userId);
    };

    socket.on(REALTIME.messageCreated, onMessageCreated);
    socket.on(REALTIME.typingStarted, onTypingStarted);
    socket.on(REALTIME.typingStopped, onTypingStopped);

    return () => {
      socket.off("connect", join);
      socket.off(REALTIME.messageCreated, onMessageCreated);
      socket.off(REALTIME.typingStarted, onTypingStarted);
      socket.off(REALTIME.typingStopped, onTypingStopped);
      if (socket.connected) {
        socket.emit(REALTIME.leaveConversation, { conversationId });
      }
    };
  }, [conversationId, queryClient]);

  return { typingNames: Object.values(typingUsers) };
}
