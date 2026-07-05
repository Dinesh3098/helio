"use client";

import { format, formatDistanceToNow } from "date-fns";
import { MessageSquareDashed, MousePointerClick, Sparkles } from "lucide-react";
import Link from "next/link";
import { EmptyState } from "@/components/shared/empty-state";
import { ErrorState } from "@/components/shared/error-state";
import { InitialsAvatar } from "@/components/shared/initials-avatar";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { useConversation } from "../hooks";
import { ChannelIcon, StatusBadge } from "./conversation-badges";

export function ConversationDetail({ id }: { id: string | null }) {
  const conversation = useConversation(id);

  if (id === null) {
    return (
      <EmptyState
        icon={MousePointerClick}
        title="Select a conversation"
        description="Choose a conversation from the list to see its details."
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
      <div className="flex items-center gap-3 border-b px-6 py-4">
        <InitialsAvatar name={detail.contact.name} className="size-10" />
        <div className="min-w-0 flex-1">
          <Link
            href={`/contacts/${detail.contact.id}`}
            className="truncate font-semibold hover:underline"
          >
            {detail.contact.name}
          </Link>
          <p className="text-muted-foreground truncate text-sm">
            {detail.subject ?? detail.contact.email ?? "No subject"}
          </p>
        </div>
        <ChannelIcon channel={detail.channel} />
        <StatusBadge status={detail.status} />
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto">
        <dl className="grid grid-cols-2 gap-x-6 gap-y-3 px-6 py-4 text-sm lg:grid-cols-4">
          <div>
            <dt className="text-muted-foreground">Assignee</dt>
            <dd className="mt-1 font-medium">
              {detail.assignee?.name ?? "Unassigned"}
            </dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Priority</dt>
            <dd className="mt-1 font-medium capitalize">
              {detail.priority.toLowerCase()}
            </dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Messages</dt>
            <dd className="mt-1 font-medium">{detail.messagesCount}</dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Last activity</dt>
            <dd className="mt-1 font-medium">
              {formatDistanceToNow(
                new Date(detail.lastMessageAt ?? detail.updatedAt),
                { addSuffix: true },
              )}
            </dd>
          </div>
        </dl>

        {detail.aiSummary && (
          <>
            <Separator />
            <div className="px-6 py-4">
              <div className="flex items-center gap-2 text-sm font-medium">
                <Sparkles className="size-4" aria-hidden />
                AI summary
                <span className="text-muted-foreground text-xs font-normal">
                  {format(new Date(detail.aiSummary.updatedAt), "MMM d, yyyy")}
                </span>
              </div>
              <p className="text-muted-foreground mt-2 text-sm">
                {detail.aiSummary.summary}
              </p>
            </div>
          </>
        )}

        <Separator />
        <EmptyState
          icon={MessageSquareDashed}
          title="Messages coming soon"
          description="The realtime message thread arrives in the next milestone."
        />
      </div>
    </div>
  );
}
