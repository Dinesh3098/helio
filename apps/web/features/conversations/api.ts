import { api } from "@/lib/api/client";
import type {
  Conversation,
  ConversationDetail,
  ConversationPriority,
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

  update: async (
    id: string,
    input: { status?: ConversationStatus; priority?: ConversationPriority },
  ) => (await api.patch<Conversation>(`/conversations/${id}`, input)).data,

  /** memberId null unassigns. */
  assign: async (id: string, workspaceMemberId: string | null) =>
    (
      await api.post<Conversation>(`/conversations/${id}/assign`, {
        workspaceMemberId,
      })
    ).data,
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
