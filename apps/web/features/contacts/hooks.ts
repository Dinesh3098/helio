"use client";

import {
  keepPreviousData,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { toast } from "sonner";
import { queryKeys } from "@/lib/query/keys";
import { contactsApi, type ContactListParams } from "./api";

export function useContacts(params: ContactListParams) {
  return useQuery({
    queryKey: queryKeys.contacts(params),
    queryFn: () => contactsApi.list(params),
    placeholderData: keepPreviousData,
  });
}

export function useContact(id: string) {
  return useQuery({
    queryKey: queryKeys.contact(id),
    queryFn: () => contactsApi.get(id),
  });
}

export function useContactConversations(id: string) {
  return useQuery({
    queryKey: queryKeys.contactConversations(id),
    queryFn: () => contactsApi.conversations(id),
  });
}

export function useUpdateContact() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: contactsApi.update,
    onSuccess: async () => {
      toast.success("Contact updated");
      // Root key covers both the lists and the detail queries.
      await queryClient.invalidateQueries({ queryKey: ["contacts"] });
    },
  });
}
