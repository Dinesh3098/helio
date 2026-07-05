import type { InfiniteData, QueryClient } from "@tanstack/react-query";
import { queryKeys } from "@/lib/query/keys";
import type {
  Conversation,
  ConversationDetail,
  Message,
  MessagesPage,
  Paginated,
} from "@/types/api";

type MessagesData = InfiniteData<MessagesPage, unknown>;

const PREVIEW_LENGTH = 140;

/**
 * Inserts a message into the thread cache (newest page), deduplicating by
 * id so an ack and the room broadcast of the same message can arrive in
 * either order. Optionally removes an optimistic placeholder in the same
 * pass. Returns whether the message was actually appended. No-op when the
 * thread was never loaded — it will fetch fresh on open.
 */
export function appendMessageToCache(
  queryClient: QueryClient,
  message: Message,
  removeId?: string,
): boolean {
  let appended = false;
  queryClient.setQueryData<MessagesData>(
    queryKeys.messages(message.conversationId),
    (data) => {
      if (!data) return data;
      const exists = data.pages.some((page) =>
        page.data.some((m) => m.id === message.id),
      );
      const pages = data.pages.map((page, index) => {
        let entries = page.data;
        if (removeId) {
          entries = entries.filter((m) => m.id !== removeId);
        }
        if (index === 0 && !exists) {
          entries = [...entries, message];
          appended = true;
        }
        return entries === page.data ? page : { ...page, data: entries };
      });
      return { ...data, pages };
    },
  );
  return appended;
}

/**
 * Mirrors the backend's side effects onto cached conversation rows —
 * preview, activity timestamps, SNOOZED→OPEN — via setQueryData, without
 * refetching. Ordering/filter drift in status-filtered lists corrects on
 * the next natural refetch.
 */
export function applyMessageToConversationCaches(
  queryClient: QueryClient,
  message: Message,
): void {
  const preview = message.content
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, PREVIEW_LENGTH);

  const bump = <T extends Conversation>(conversation: T): T =>
    conversation.id === message.conversationId
      ? {
          ...conversation,
          lastMessagePreview: preview,
          lastMessageAt: message.createdAt,
          updatedAt: message.createdAt,
          status:
            conversation.status === "SNOOZED" ? "OPEN" : conversation.status,
        }
      : conversation;

  queryClient.setQueriesData<Paginated<Conversation>>(
    {
      predicate: (query) =>
        query.queryKey[0] === "conversations" &&
        query.queryKey.length === 2 &&
        typeof query.queryKey[1] === "object" &&
        query.queryKey[1] !== null,
    },
    (page) => (page ? { ...page, data: page.data.map(bump) } : page),
  );

  queryClient.setQueryData<ConversationDetail>(
    queryKeys.conversation(message.conversationId),
    (detail) => (detail ? bump(detail) : detail),
  );
}
