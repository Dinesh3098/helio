import { api } from "@/lib/api/client";
import type {
  Conversation,
  ConversationDetail,
  ConversationStatus,
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
