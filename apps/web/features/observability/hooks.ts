"use client";

import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { queryKeys } from "@/lib/query/keys";
import { observabilityApi } from "./api";

export function useAuditLogs(params: { resourceType?: string; page: number }) {
  return useQuery({
    queryKey: queryKeys.auditLogs(params),
    queryFn: () => observabilityApi.auditLogs(params),
    placeholderData: keepPreviousData,
  });
}

export function useSystemStatus() {
  return useQuery({
    queryKey: queryKeys.systemStatus,
    queryFn: observabilityApi.system,
    // Live-ish dashboard: refresh every 10s while the page is open.
    refetchInterval: 10_000,
  });
}

export function useConversationTimeline(
  conversationId: string,
  enabled: boolean,
) {
  return useQuery({
    queryKey: queryKeys.timeline(conversationId),
    queryFn: () => observabilityApi.timeline(conversationId),
    enabled,
  });
}
