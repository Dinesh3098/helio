"use client";

import { formatDistanceToNow } from "date-fns";
import { Inbox } from "lucide-react";
import { useState } from "react";
import { EmptyState } from "@/components/shared/empty-state";
import { ErrorState } from "@/components/shared/error-state";
import { PaginationControls } from "@/components/shared/pagination-controls";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";
import { useUiStore } from "@/stores/ui-store";
import type { ConversationStatus } from "@/types/api";
import { useConversations } from "../hooks";
import { ChannelIcon, StatusBadge } from "./conversation-badges";

const PAGE_LIMIT = 20;

type StatusFilter = ConversationStatus | "ALL";

export function ConversationList({
  selectedId,
  onSelect,
}: {
  selectedId: string | null;
  onSelect: (id: string) => void;
}) {
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("OPEN");
  const [page, setPage] = useState(1);
  const unreadCounts = useUiStore((s) => s.unreadCounts);

  const conversations = useConversations({
    status: statusFilter === "ALL" ? undefined : statusFilter,
    page,
  });

  const onFilterChange = (value: string) => {
    setStatusFilter(value as StatusFilter);
    setPage(1);
  };

  return (
    <div className="flex h-full flex-col">
      <div className="border-b p-3">
        <Tabs value={statusFilter} onValueChange={onFilterChange}>
          <TabsList className="w-full">
            <TabsTrigger value="OPEN">Open</TabsTrigger>
            <TabsTrigger value="SNOOZED">Snoozed</TabsTrigger>
            <TabsTrigger value="RESOLVED">Resolved</TabsTrigger>
            <TabsTrigger value="ALL">All</TabsTrigger>
          </TabsList>
        </Tabs>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto">
        {conversations.isPending ? (
          <div className="space-y-2 p-3">
            {Array.from({ length: 8 }).map((_, i) => (
              <Skeleton key={i} className="h-16 w-full" />
            ))}
          </div>
        ) : conversations.isError ? (
          <ErrorState
            error={conversations.error}
            onRetry={conversations.refetch}
          />
        ) : conversations.data.data.length === 0 ? (
          <EmptyState
            icon={Inbox}
            title="No conversations"
            description={
              statusFilter === "ALL"
                ? "Conversations appear here when customers reach out."
                : `No ${statusFilter.toLowerCase()} conversations right now.`
            }
          />
        ) : (
          <ul className="divide-y" aria-label="Conversations">
            {conversations.data.data.map((conversation) => {
              const selected = conversation.id === selectedId;
              const unread = unreadCounts[conversation.id] ?? 0;
              const timestamp =
                conversation.lastMessageAt ?? conversation.updatedAt;
              return (
                <li key={conversation.id}>
                  <button
                    type="button"
                    aria-current={selected ? "true" : undefined}
                    onClick={() => onSelect(conversation.id)}
                    className={cn(
                      "hover:bg-accent/60 w-full px-4 py-3 text-left transition-colors",
                      selected && "bg-accent",
                    )}
                  >
                    <div className="flex items-center gap-2">
                      <ChannelIcon channel={conversation.channel} />
                      <span className="min-w-0 flex-1 truncate font-medium">
                        {conversation.contactName}
                      </span>
                      {unread > 0 && !selected && (
                        <Badge
                          className="h-5 min-w-5 shrink-0 rounded-full px-1.5"
                          aria-label={`${unread} unread messages`}
                        >
                          {unread}
                        </Badge>
                      )}
                      <span className="text-muted-foreground shrink-0 text-xs">
                        {formatDistanceToNow(new Date(timestamp), {
                          addSuffix: true,
                        })}
                      </span>
                    </div>
                    <div className="mt-1 flex items-center gap-2">
                      <p className="text-muted-foreground min-w-0 flex-1 truncate text-sm">
                        {conversation.lastMessagePreview ??
                          conversation.subject ??
                          "No messages yet"}
                      </p>
                      <StatusBadge status={conversation.status} />
                    </div>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {conversations.isSuccess && (
        <PaginationControls
          page={page}
          total={conversations.data.total}
          limit={PAGE_LIMIT}
          onPageChange={setPage}
          className="border-t p-3"
        />
      )}
    </div>
  );
}
