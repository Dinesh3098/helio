"use client";

import { format } from "date-fns";
import { ScrollText, ShieldAlert } from "lucide-react";
import { useState } from "react";
import { EmptyState } from "@/components/shared/empty-state";
import { ErrorState } from "@/components/shared/error-state";
import { PageHeader } from "@/components/shared/page-header";
import { PaginationControls } from "@/components/shared/pagination-controls";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useAuditLogs } from "@/features/observability/hooks";
import { useCurrentMember } from "@/features/workspace/hooks";

const PAGE_LIMIT = 25;
const ALL = "all";

const RESOURCE_TYPES = [
  "auth",
  "workspace",
  "member",
  "contact",
  "conversation",
  "kb_category",
  "kb_article",
  "email_account",
];

/** conversation.status_changed -> "Status changed". */
function humanize(action: string): string {
  const verb = action.split(".")[1] ?? action;
  const text = verb.replaceAll("_", " ");
  return text.charAt(0).toUpperCase() + text.slice(1);
}

function metadataSummary(metadata: Record<string, unknown> | null): string {
  if (!metadata) return "";
  return Object.entries(metadata)
    .filter(([key]) => key !== "requestId")
    .map(([key, value]) =>
      Array.isArray(value)
        ? `${key}: ${value.join(", ")}`
        : `${key}: ${String(value)}`,
    )
    .join(" · ");
}

export default function AuditLogsPage() {
  const viewer = useCurrentMember();
  const [resourceType, setResourceType] = useState(ALL);
  const [page, setPage] = useState(1);

  const logs = useAuditLogs({
    resourceType: resourceType === ALL ? undefined : resourceType,
    page,
  });

  if (viewer && viewer.role === "AGENT") {
    return (
      <div className="mx-auto max-w-5xl p-6">
        <EmptyState
          icon={ShieldAlert}
          title="Owners and admins only"
          description="The audit trail is restricted to workspace administrators."
        />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-6xl space-y-6 p-6">
      <PageHeader
        title="Audit Logs"
        description="Every administrative and system action in this workspace."
        actions={
          <Select
            value={resourceType}
            onValueChange={(value) => {
              setResourceType(value);
              setPage(1);
            }}
          >
            <SelectTrigger className="w-44" aria-label="Filter by resource">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>All resources</SelectItem>
              {RESOURCE_TYPES.map((type) => (
                <SelectItem key={type} value={type}>
                  {type.replaceAll("_", " ")}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        }
      />

      {logs.isPending ? (
        <div className="space-y-2">
          {Array.from({ length: 8 }).map((_, i) => (
            <Skeleton key={i} className="h-12 w-full" />
          ))}
        </div>
      ) : logs.isError ? (
        <ErrorState error={logs.error} onRetry={logs.refetch} />
      ) : logs.data.data.length === 0 ? (
        <EmptyState
          icon={ScrollText}
          title="No audit events yet"
          description="Actions like status changes, invites, and edits appear here."
        />
      ) : (
        <>
          <div className="rounded-lg border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>When</TableHead>
                  <TableHead>Actor</TableHead>
                  <TableHead>Action</TableHead>
                  <TableHead>Details</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {logs.data.data.map((log) => (
                  <TableRow key={log.id}>
                    <TableCell className="text-muted-foreground whitespace-nowrap">
                      {format(new Date(log.createdAt), "MMM d, HH:mm:ss")}
                    </TableCell>
                    <TableCell>
                      {log.actorName ?? (
                        <Badge variant="secondary">System</Badge>
                      )}
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className="font-normal">
                        {log.resourceType}
                      </Badge>{" "}
                      <span className="text-sm">{humanize(log.action)}</span>
                    </TableCell>
                    <TableCell className="text-muted-foreground max-w-md truncate text-xs">
                      {metadataSummary(log.metadata)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
          <PaginationControls
            page={page}
            total={logs.data.total}
            limit={PAGE_LIMIT}
            onPageChange={setPage}
          />
        </>
      )}
    </div>
  );
}
