import type {
  InfiniteData,
  Query,
  QueryClient,
} from "@tanstack/react-query";
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

/** Matches the paginated list queries: ["conversations", {status, page}]. */
function isConversationListQuery(query: Query): boolean {
  return (
    query.queryKey[0] === "conversations" &&
    query.queryKey.length === 2 &&
    typeof query.queryKey[1] === "object" &&
    query.queryKey[1] !== null
  );
}

/**
 * Status-filtered lists change MEMBERSHIP when a conversation's status
 * changes — an in-place row merge cannot move a conversation from the
 * Open tab's cached page into the Snoozed tab's. Invalidating refetches
 * the visible tab in the background and marks the hidden tabs stale, so
 * switching tabs refetches immediately instead of serving a cached page
 * for the rest of its staleTime.
 */
export function invalidateConversationLists(queryClient: QueryClient): void {
  void queryClient.invalidateQueries({ predicate: isConversationListQuery });
}

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

export interface ConversationAssignee {
  userId: string;
  name: string;
  email: string;
}

/**
 * Folds a management change (status/priority/assignee) into the caches:
 * the detail is merged in place (the open header updates instantly), and
 * the list queries are invalidated so every tab's membership is correct.
 * `assignee` undefined = leave it untouched (status/priority PATCHes
 * don't know it); null/value = overwrite.
 */
export function applyConversationUpdate(
  queryClient: QueryClient,
  updated: Conversation,
  assignee?: ConversationAssignee | null,
): void {
  const merge = <T extends Conversation>(row: T): T =>
    row.id === updated.id
      ? {
          ...row,
          status: updated.status,
          priority: updated.priority,
          assignedToUserId: updated.assignedToUserId,
          updatedAt: updated.updatedAt,
        }
      : row;

  // In-place merge keeps whatever is on screen coherent while the
  // refetch triggered below is in flight.
  queryClient.setQueriesData<Paginated<Conversation>>(
    { predicate: isConversationListQuery },
    (page) => (page ? { ...page, data: page.data.map(merge) } : page),
  );

  queryClient.setQueryData<ConversationDetail>(
    queryKeys.conversation(updated.id),
    (detail) =>
      detail
        ? {
            ...merge(detail),
            ...(assignee !== undefined ? { assignee } : {}),
          }
        : detail,
  );

  // Management actions are rare — a list refetch per change is cheap and
  // the only way to move rows between status-filtered tabs.
  invalidateConversationLists(queryClient);
}

/**
 * Mirrors the backend's side effects onto cached conversation rows —
 * preview, activity timestamps, SNOOZED→OPEN — via setQueryData, without
 * refetching. When the snooze flip actually happens, list membership
 * changed, so the lists are additionally invalidated (only in that case —
 * plain messages are frequent and must stay refetch-free).
 */
export function applyMessageToConversationCaches(
  queryClient: QueryClient,
  message: Message,
): void {
  const preview = message.content
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, PREVIEW_LENGTH);

  let statusFlipped = false;

  const bump = <T extends Conversation>(conversation: T): T => {
    if (conversation.id !== message.conversationId) return conversation;
    if (conversation.status === "SNOOZED") statusFlipped = true;
    return {
      ...conversation,
      lastMessagePreview: preview,
      lastMessageAt: message.createdAt,
      updatedAt: message.createdAt,
      status:
        conversation.status === "SNOOZED" ? "OPEN" : conversation.status,
    };
  };

  queryClient.setQueriesData<Paginated<Conversation>>(
    { predicate: isConversationListQuery },
    (page) => (page ? { ...page, data: page.data.map(bump) } : page),
  );

  queryClient.setQueryData<ConversationDetail>(
    queryKeys.conversation(message.conversationId),
    (detail) => (detail ? bump(detail) : detail),
  );

  if (statusFlipped) {
    invalidateConversationLists(queryClient);
  }
}
