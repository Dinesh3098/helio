import { api } from "@/lib/api/client";
import type {
  AuditLogEntry,
  Paginated,
  SystemStatus,
  TimelineEntry,
} from "@/types/api";

export const observabilityApi = {
  auditLogs: async (params: {
    resourceType?: string;
    page: number;
  }) =>
    (
      await api.get<Paginated<AuditLogEntry>>("/audit/logs", {
        params: {
          ...params,
          resourceType: params.resourceType || undefined,
        },
      })
    ).data,

  system: async () => (await api.get<SystemStatus>("/admin/system")).data,

  timeline: async (conversationId: string) =>
    (
      await api.get<{ entries: TimelineEntry[] }>(
        `/conversations/${conversationId}/timeline`,
      )
    ).data,
};
