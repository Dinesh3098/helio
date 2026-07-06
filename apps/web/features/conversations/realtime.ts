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
import { useWorkspaceStore } from "@/stores/workspace-store";
import type { Conversation, Message } from "@/types/api";
import {
  appendMessageToCache,
  applyConversationUpdate,
  applyMessageToConversationCaches,
  invalidateConversationLists,
  type ConversationAssignee,
} from "./cache";

/**
 * Owns the socket connection for the session AND the workspace-wide
 * event handlers. Mounted once in the dashboard layout. Joining the
 * workspace room is what makes the inbox live for conversations the
 * agent has NOT opened — new visitors, other threads, email arrivals.
 * All message/update cache work lives here (one listener, no double
 * counting); useConversationRoom only manages the per-conversation room
 * and typing indicators.
 */
export function useRealtimeConnection(userId: string | undefined): void {
  const queryClient = useQueryClient();
  const activeWorkspaceId = useWorkspaceStore((s) => s.activeWorkspaceId);

  useEffect(() => {
    if (!userId || !activeWorkspaceId) return;
    const socket = connectSocket();

    const joinWorkspace = () =>
      socket.emit(REALTIME.joinWorkspace, {
        workspaceId: activeWorkspaceId,
      });
    if (socket.connected) joinWorkspace();
    // Re-join after every reconnect.
    socket.on("connect", joinWorkspace);

    const onMessageCreated = (message: Message) => {
      const found = applyMessageToConversationCaches(queryClient, message);
      if (!found) {
        // Not in any cached list page — a new conversation. Refetch so it
        // appears at the top of the inbox.
        invalidateConversationLists(queryClient);
      }
      // AI outputs describe the transcript — stale once messages arrive.
      void queryClient.invalidateQueries({
        queryKey: ["ai", message.conversationId],
      });

      const { selectedConversationId, incrementUnread } =
        useUiStore.getState();
      if (message.conversationId === selectedConversationId) {
        appendMessageToCache(queryClient, message);
      } else if (message.senderType === "CONTACT") {
        // Badge only customer messages — own/automation replies in other
        // tabs shouldn't demand attention.
        incrementUnread(message.conversationId);
      }
    };

    const onConversationUpdated = (
      payload: Conversation & { assignee: ConversationAssignee | null },
    ) => {
      applyConversationUpdate(queryClient, payload, payload.assignee);
    };

    socket.on(REALTIME.messageCreated, onMessageCreated);
    socket.on(REALTIME.conversationUpdated, onConversationUpdated);

    return () => {
      socket.off("connect", joinWorkspace);
      socket.off(REALTIME.messageCreated, onMessageCreated);
      socket.off(REALTIME.conversationUpdated, onConversationUpdated);
      disconnectSocket();
    };
  }, [userId, activeWorkspaceId, queryClient]);
}

/**
 * Joins the conversation's room while it is open (needed for typing
 * indicators and so visitor-side broadcasts reach this viewer even
 * without the workspace room), re-joins after reconnects, and reports
 * who is typing. Message cache updates happen in useRealtimeConnection.
 */
export function useConversationRoom(conversationId: string | null): {
  typingNames: string[];
} {
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

    // A message from someone ends their typing indicator.
    const onMessageCreated = (message: Message) => {
      if (message.conversationId === conversationId && message.senderId) {
        removeTyping(message.senderId);
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
  }, [conversationId]);

  return { typingNames: Object.values(typingUsers) };
}
