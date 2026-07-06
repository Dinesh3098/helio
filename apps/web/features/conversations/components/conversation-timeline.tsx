"use client";

import { format } from "date-fns";
import { CircleDot, History } from "lucide-react";
import { EmptyState } from "@/components/shared/empty-state";
import { ErrorState } from "@/components/shared/error-state";
import { Skeleton } from "@/components/ui/skeleton";
import { useConversationTimeline } from "@/features/observability/hooks";
import { MessageBubble } from "./message-bubble";

/** conversation.status_changed {from,to} -> "Status changed: OPEN → SNOOZED". */
function describeEvent(
  action: string,
  metadata: Record<string, unknown> | null,
): string {
  const verb = (action.split(".")[1] ?? action).replaceAll("_", " ");
  const label = verb.charAt(0).toUpperCase() + verb.slice(1);
  if (metadata && "from" in metadata && "to" in metadata) {
    return `${label}: ${String(metadata.from)} → ${String(metadata.to)}`;
  }
  if (metadata && "tag" in metadata) {
    return `${label}: ${String(metadata.tag)}`;
  }
  return label;
}

/**
 * The conversation's full activity: messages interleaved with audit
 * events (status/priority/assignment/tag changes), oldest first.
 */
export function ConversationTimeline({
  conversationId,
}: {
  conversationId: string;
}) {
  const timeline = useConversationTimeline(conversationId, true);

  if (timeline.isPending) {
    return (
      <div className="flex-1 space-y-4 overflow-y-auto p-6">
        {Array.from({ length: 5 }).map((_, i) => (
          <Skeleton key={i} className="h-12 w-full" />
        ))}
      </div>
    );
  }

  if (timeline.isError) {
    return (
      <div className="flex-1">
        <ErrorState error={timeline.error} onRetry={timeline.refetch} />
      </div>
    );
  }

  if (timeline.data.entries.length === 0) {
    return (
      <div className="flex-1">
        <EmptyState
          icon={History}
          title="No activity yet"
          description="Messages and changes will appear here chronologically."
        />
      </div>
    );
  }

  return (
    <div
      className="min-h-0 flex-1 overflow-y-auto"
      aria-label="Activity timeline"
    >
      <div className="mx-auto flex max-w-3xl flex-col gap-4 p-6">
        {timeline.data.entries.map((entry) =>
          entry.kind === "message" && entry.message ? (
            <MessageBubble key={entry.message.id} message={entry.message} />
          ) : entry.event ? (
            <div
              key={entry.event.id}
              className="text-muted-foreground flex items-center gap-2 text-xs"
            >
              <CircleDot className="size-3 shrink-0" aria-hidden />
              <span className="bg-border h-px flex-1" aria-hidden />
              <span className="max-w-[70%] text-center">
                <span className="text-foreground font-medium">
                  {entry.event.actorName ?? "System"}
                </span>{" "}
                · {describeEvent(entry.event.action, entry.event.metadata)} ·{" "}
                {format(new Date(entry.event.createdAt), "MMM d, HH:mm")}
              </span>
              <span className="bg-border h-px flex-1" aria-hidden />
            </div>
          ) : null,
        )}
      </div>
    </div>
  );
}
