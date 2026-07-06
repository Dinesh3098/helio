"use client";

import {
  keepPreviousData,
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
  type InfiniteData,
} from "@tanstack/react-query";
import { isAxiosError } from "axios";
import { toast } from "sonner";
import { useMe } from "@/features/auth/hooks";
import { getApiErrorMessage } from "@/lib/api/client";
import { queryKeys } from "@/lib/query/keys";
import {
  getSocket,
  REALTIME,
  type SendMessageAck,
} from "@/lib/realtime/socket";
import type {
  ConversationChannel,
  ConversationPriority,
  ConversationStatus,
  Message,
  MessageAttachment,
  MessagesPage,
} from "@/types/api";
import {
  conversationsApi,
  emailApi,
  messagesApi,
  type ConversationListParams,
} from "./api";
import {
  appendMessageToCache,
  applyConversationUpdate,
  applyMessageToConversationCaches,
  type ConversationAssignee,
} from "./cache";

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

/** Status/priority PATCH; caches updated in place, no refetch. */
export function useUpdateConversation(conversationId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: {
      status?: ConversationStatus;
      priority?: ConversationPriority;
    }) => conversationsApi.update(conversationId, input),
    onSuccess: (conversation) =>
      applyConversationUpdate(queryClient, conversation),
    onError: (error) => toast.error(getApiErrorMessage(error)),
  });
}

/**
 * Assign / unassign. The caller passes the assignee's display identity
 * alongside the member id so the detail cache can update without a
 * refetch (the REST response only carries the user id).
 */
export function useAssignConversation(conversationId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: {
      workspaceMemberId: string | null;
      assignee: ConversationAssignee | null;
    }) => conversationsApi.assign(conversationId, input.workspaceMemberId),
    onSuccess: (conversation, input) =>
      applyConversationUpdate(queryClient, conversation, input.assignee),
    onError: (error) => toast.error(getApiErrorMessage(error)),
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

export function useSendMessage(
  conversationId: string,
  channel: ConversationChannel = "CHAT",
) {
  const queryClient = useQueryClient();
  const { data: me } = useMe();
  const messagesKey = queryKeys.messages(conversationId);

  return useMutation({
    // Email replies must go through the provider, so they always take the
    // email REST endpoint (the backend broadcasts to the room for other
    // agents). Chat: socket first — the gateway persists via the same
    // MessagesService and broadcasts; REST is the offline fallback.
    mutationFn: async (input: {
      content: string;
      attachmentIds?: string[];
      /** Display summaries for the optimistic bubble only. */
      optimisticAttachments?: MessageAttachment[];
    }) => {
      if (channel === "EMAIL") {
        return emailApi.sendReply({ conversationId, content: input.content });
      }
      const socket = getSocket();
      if (socket.connected) {
        const ack = (await socket
          .timeout(8000)
          .emitWithAck(REALTIME.sendMessage, {
            conversationId,
            content: input.content,
            attachmentIds: input.attachmentIds,
          })) as SendMessageAck;
        if ("error" in ack) throw new Error(ack.error);
        return ack.message;
      }
      return messagesApi.send({
        conversationId,
        content: input.content,
        attachmentIds: input.attachmentIds,
      });
    },

    onMutate: async ({ content, optimisticAttachments }) => {
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
        metadata: optimisticAttachments?.length
          ? { attachments: optimisticAttachments }
          : null,
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
      toast.error(
        isAxiosError(error)
          ? getApiErrorMessage(error)
          : error.message || "Could not send the message",
      );
    },

    // Swap the optimistic placeholder for the persisted message (the room
    // broadcast may have appended it already — appendMessageToCache
    // dedupes by id) and bump list/detail caches in place. No refetch.
    onSuccess: (message, _content, context) => {
      appendMessageToCache(queryClient, message, context.optimisticId);
      applyMessageToConversationCaches(queryClient, message);
    },
  });
}
