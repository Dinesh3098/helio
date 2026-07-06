"use client";

import {
  keepPreviousData,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { toast } from "sonner";
import { getApiErrorMessage } from "@/lib/api/client";
import { queryKeys } from "@/lib/query/keys";
import { automationApi } from "./api";

export function useAutomationRules() {
  return useQuery({
    queryKey: queryKeys.automationRules,
    queryFn: automationApi.listRules,
  });
}

function useAutomationInvalidate() {
  const queryClient = useQueryClient();
  return () => queryClient.invalidateQueries({ queryKey: ["automation"] });
}

export function useCreateRule() {
  const invalidate = useAutomationInvalidate();
  return useMutation({
    mutationFn: automationApi.createRule,
    onSuccess: async () => {
      toast.success("Rule created");
      await invalidate();
    },
  });
}

export function useUpdateRule() {
  const invalidate = useAutomationInvalidate();
  return useMutation({
    mutationFn: automationApi.updateRule,
    onSuccess: async () => {
      toast.success("Rule saved");
      await invalidate();
    },
    onError: (error) => toast.error(getApiErrorMessage(error)),
  });
}

/** Enable/disable without the generic "Rule saved" toast noise. */
export function useToggleRule() {
  const invalidate = useAutomationInvalidate();
  return useMutation({
    mutationFn: (input: { id: string; enabled: boolean }) =>
      automationApi.updateRule(input),
    onSuccess: async () => {
      await invalidate();
    },
    onError: (error) => toast.error(getApiErrorMessage(error)),
  });
}

export function useDeleteRule() {
  const invalidate = useAutomationInvalidate();
  return useMutation({
    mutationFn: automationApi.deleteRule,
    onSuccess: async () => {
      toast.success("Rule deleted");
      await invalidate();
    },
    onError: (error) => toast.error(getApiErrorMessage(error)),
  });
}

export function useTestRule() {
  const invalidate = useAutomationInvalidate();
  return useMutation({
    mutationFn: (input: { id: string; conversationId: string }) =>
      automationApi.testRule(input.id, input.conversationId),
    onSuccess: async (result) => {
      if (!result.matched) {
        toast.info("Conditions did not match this conversation");
      } else if (result.status === "FAILED") {
        toast.error(`Rule ran but failed: ${result.error ?? "unknown error"}`);
      } else {
        toast.success("Rule executed successfully");
      }
      await invalidate();
    },
    onError: (error) => toast.error(getApiErrorMessage(error)),
  });
}

export function useAutomationHistory(params: {
  ruleId?: string;
  page: number;
}) {
  return useQuery({
    queryKey: queryKeys.automationHistory(params),
    queryFn: () => automationApi.history(params),
    placeholderData: keepPreviousData,
  });
}
