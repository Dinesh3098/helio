"use client";

import {
  keepPreviousData,
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
  type InfiniteData,
} from "@tanstack/react-query";
import { toast } from "sonner";
import { useMe } from "@/features/auth/hooks";
import { getApiErrorMessage } from "@/lib/api/client";
import { queryKeys } from "@/lib/query/keys";
import type { Message, MessagesPage } from "@/types/api";
import {
  conversationsApi,
  messagesApi,
  type ConversationListParams,
} from "./api";

export function useConversations(params: ConversationListParams) {
  return useQuery({
    queryKey: queryKeys.conversations(params),
    queryFn: () => conversationsApi.list(params),
    placeholderData: keepPreviousData,
  });
}

export function useConversation(id: string | null) {
  return useQuery({
    queryKey: queryKeys.conversation(id ?? ""),
    queryFn: () => conversationsApi.get(id as string),
    enabled: id !== null,
  });
}

type MessagesData = InfiniteData<MessagesPage, string | undefined>;

/**
 * pages[0] is the newest chunk; following pages walk toward older
 * messages via the keyset cursor. Render with `flatMessages`.
 */
export function useMessages(conversationId: string) {
  return useInfiniteQuery({
    queryKey: queryKeys.messages(conversationId),
    queryFn: ({ pageParam }) => messagesApi.list(conversationId, pageParam),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
  });
}

/** Flattens infinite pages into chronological (oldest→newest) order. */
export function flatMessages(
  data: InfiniteData<MessagesPage, unknown> | undefined,
): Message[] {
  if (!data) return [];
  return [...data.pages].reverse().flatMap((page) => page.data);
}

const OPTIMISTIC_PREFIX = "optimistic-";

export function isOptimistic(message: Message): boolean {
  return message.id.startsWith(OPTIMISTIC_PREFIX);
}

export function useSendMessage(conversationId: string) {
  const queryClient = useQueryClient();
  const { data: me } = useMe();
  const messagesKey = queryKeys.messages(conversationId);

  return useMutation({
    mutationFn: (content: string) =>
      messagesApi.send({ conversationId, content }),

    onMutate: async (content) => {
      await queryClient.cancelQueries({ queryKey: messagesKey });
      const previous = queryClient.getQueryData<MessagesData>(messagesKey);

      const optimistic: Message = {
        id: `${OPTIMISTIC_PREFIX}${Date.now()}`,
        conversationId,
        senderType: "USER",
        senderId: me?.id ?? null,
        senderName: me?.name ?? null,
        content,
        messageType: "TEXT",
        createdAt: new Date().toISOString(),
      };

      queryClient.setQueryData<MessagesData>(messagesKey, (data) => {
        if (!data) {
          return {
            pages: [{ data: [optimistic], nextCursor: null }],
            pageParams: [undefined],
          };
        }
        // The newest page is pages[0]; append there.
        return {
          ...data,
          pages: data.pages.map((page, index) =>
            index === 0 ? { ...page, data: [...page.data, optimistic] } : page,
          ),
        };
      });

      return { previous, optimisticId: optimistic.id };
    },

    onError: (error, _content, context) => {
      if (context?.previous) {
        queryClient.setQueryData(messagesKey, context.previous);
      }
      toast.error(getApiErrorMessage(error));
    },

    onSuccess: (message, _content, context) => {
      queryClient.setQueryData<MessagesData>(messagesKey, (data) => {
        if (!data) return data;
        return {
          ...data,
          pages: data.pages.map((page, index) =>
            index === 0
              ? {
                  ...page,
                  data: page.data.map((m) =>
                    m.id === context.optimisticId ? message : m,
                  ),
                }
              : page,
          ),
        };
      });
    },

    onSettled: async () => {
      // Refresh the lists and detail: preview, timestamps, and a possible
      // SNOOZED→OPEN transition. The nested messages key refetching too is
      // harmless — the cache already matches the server.
      await queryClient.invalidateQueries({ queryKey: ["conversations"] });
    },
  });
}
