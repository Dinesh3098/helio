import { api } from "@/lib/api/client";
import type {
  Conversation,
  ConversationDetail,
  ConversationStatus,
  Message,
  MessagesPage,
  Paginated,
} from "@/types/api";

export interface ConversationListParams {
  status?: ConversationStatus;
  page: number;
}

export const conversationsApi = {
  list: async (params: ConversationListParams) =>
    (await api.get<Paginated<Conversation>>("/conversations", { params }))
      .data,

  get: async (id: string) =>
    (await api.get<ConversationDetail>(`/conversations/${id}`)).data,
};

export const emailApi = {
  /** Delivers via the workspace's email account AND records the Message. */
  sendReply: async (input: { conversationId: string; content: string }) =>
    (
      await api.post<Message>(
        `/email/conversations/${input.conversationId}/send`,
        { content: input.content },
      )
    ).data,
};

export const messagesApi = {
  list: async (conversationId: string, cursor?: string) =>
    (
      await api.get<MessagesPage>(
        `/conversations/${conversationId}/messages`,
        { params: { cursor } },
      )
    ).data,

  send: async (input: { conversationId: string; content: string }) =>
    (
      await api.post<Message>(
        `/conversations/${input.conversationId}/messages`,
        { content: input.content },
      )
    ).data,
};
