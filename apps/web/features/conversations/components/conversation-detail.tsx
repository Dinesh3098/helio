"use client";

import { formatDistanceToNow } from "date-fns";
import { Lock, MousePointerClick, Sparkles } from "lucide-react";
import Link from "next/link";
import { EmptyState } from "@/components/shared/empty-state";
import { ErrorState } from "@/components/shared/error-state";
import { InitialsAvatar } from "@/components/shared/initials-avatar";
import { Skeleton } from "@/components/ui/skeleton";
import { useConversation } from "../hooks";
import { ChannelIcon, StatusBadge } from "./conversation-badges";
import { MessageComposer } from "./message-composer";
import { MessageThread } from "./message-thread";

export function ConversationDetail({ id }: { id: string | null }) {
  const conversation = useConversation(id);

  if (id === null) {
    return (
      <EmptyState
        icon={MousePointerClick}
        title="Select a conversation"
        description="Choose a conversation from the list to see its messages."
      />
    );
  }

  if (conversation.isPending) {
    return (
      <div className="space-y-4 p-6">
        <div className="flex items-center gap-3">
          <Skeleton className="size-10 rounded-full" />
          <div className="space-y-2">
            <Skeleton className="h-4 w-40" />
            <Skeleton className="h-3 w-56" />
          </div>
        </div>
        <Skeleton className="h-40 w-full" />
      </div>
    );
  }

  if (conversation.isError) {
    return (
      <ErrorState error={conversation.error} onRetry={conversation.refetch} />
    );
  }

  const detail = conversation.data;

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-3 border-b px-6 py-3">
        <InitialsAvatar name={detail.contact.name} className="size-10" />
        <div className="min-w-0 flex-1">
          <Link
            href={`/contacts/${detail.contact.id}`}
            className="truncate font-semibold hover:underline"
          >
            {detail.contact.name}
          </Link>
          <p className="text-muted-foreground truncate text-xs">
            {detail.assignee
              ? `Assigned to ${detail.assignee.name}`
              : "Unassigned"}
            {" · "}
            <span className="capitalize">
              {detail.priority.toLowerCase()} priority
            </span>
            {" · "}
            {formatDistanceToNow(
              new Date(detail.lastMessageAt ?? detail.updatedAt),
              { addSuffix: true },
            )}
          </p>
        </div>
        <ChannelIcon channel={detail.channel} />
        <StatusBadge status={detail.status} />
      </div>

      {detail.aiSummary && (
        <div className="bg-muted/50 flex items-start gap-2 border-b px-6 py-3">
          <Sparkles className="mt-0.5 size-4 shrink-0" aria-hidden />
          <p className="text-muted-foreground line-clamp-2 text-sm">
            <span className="text-foreground font-medium">AI summary: </span>
            {detail.aiSummary.summary}
          </p>
        </div>
      )}

      <MessageThread conversationId={detail.id} />

      {detail.status === "RESOLVED" ? (
        <div className="text-muted-foreground flex items-center justify-center gap-2 border-t p-4 text-sm">
          <Lock className="size-4" aria-hidden />
          This conversation is resolved. Reopen it to reply.
        </div>
      ) : (
        <MessageComposer conversationId={detail.id} />
      )}
    </div>
  );
}
