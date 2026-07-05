import { api } from "@/lib/api/client";
import type {
  Contact,
  ContactDetail,
  Conversation,
  Paginated,
} from "@/types/api";

export interface ContactListParams {
  search?: string;
  page: number;
}

export interface UpdateContactInput {
  id: string;
  name?: string;
  email?: string;
  phone?: string;
}

export const contactsApi = {
  list: async (params: ContactListParams) =>
    (
      await api.get<Paginated<Contact>>("/contacts", {
        params: { ...params, search: params.search || undefined },
      })
    ).data,

  get: async (id: string) =>
    (await api.get<ContactDetail>(`/contacts/${id}`)).data,

  update: async ({ id, ...input }: UpdateContactInput) =>
    (await api.patch<Contact>(`/contacts/${id}`, input)).data,

  conversations: async (id: string) =>
    (await api.get<Paginated<Conversation>>(`/contacts/${id}/conversations`))
      .data,
};
