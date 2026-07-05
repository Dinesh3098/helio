"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { getApiErrorMessage } from "@/lib/api/client";
import { queryKeys } from "@/lib/query/keys";
import { useUiStore } from "@/stores/ui-store";
import { aiApi, type RewriteStyle } from "./api";

/** Cached stored summary; null means none generated yet. */
export function useAiSummary(conversationId: string) {
  return useQuery({
    queryKey: queryKeys.aiSummary(conversationId),
    queryFn: () => aiApi.getSummary(conversationId),
    staleTime: Infinity,
    retry: false,
  });
}

export function useGenerateSummary(conversationId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => aiApi.generateSummary(conversationId),
    onSuccess: (summary) => {
      queryClient.setQueryData(queryKeys.aiSummary(conversationId), summary);
    },
    onError: (error) => toast.error(getApiErrorMessage(error)),
  });
}

export function useSuggestReply(conversationId: string) {
  return useMutation({
    mutationFn: (instructions?: string) =>
      aiApi.suggestReply(conversationId, instructions),
    onError: (error) => toast.error(getApiErrorMessage(error)),
  });
}

export function useRewriteDraft() {
  const setComposerDraft = useUiStore((s) => s.setComposerDraft);
  return useMutation({
    mutationFn: ({ draft, style }: { draft: string; style: RewriteStyle }) =>
      aiApi.rewrite(draft, style),
    onSuccess: (text) => setComposerDraft(text),
    onError: (error) => toast.error(getApiErrorMessage(error)),
  });
}

/**
 * On-demand queries (enabled: false, fired via refetch): the result is
 * cached per conversation like any server state, and the realtime layer
 * invalidates the whole ["ai", id] branch when new messages arrive.
 */
export function useClassification(conversationId: string) {
  return useQuery({
    queryKey: queryKeys.aiClassification(conversationId),
    queryFn: () => aiApi.classify(conversationId),
    enabled: false,
    staleTime: Infinity,
    retry: false,
  });
}

export function useKbSuggestions(conversationId: string) {
  return useQuery({
    queryKey: queryKeys.aiKbSuggestions(conversationId),
    queryFn: () => aiApi.suggestArticles(conversationId),
    enabled: false,
    staleTime: Infinity,
    retry: false,
  });
}
