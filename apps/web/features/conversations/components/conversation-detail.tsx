"use client";

import { formatDistanceToNow } from "date-fns";
import { Lock, MousePointerClick, Sparkles } from "lucide-react";
import Link from "next/link";
import { EmptyState } from "@/components/shared/empty-state";
import { ErrorState } from "@/components/shared/error-state";
import { InitialsAvatar } from "@/components/shared/initials-avatar";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { AiPanel } from "@/features/ai/components/ai-panel";
import { cn } from "@/lib/utils";
import { useUiStore } from "@/stores/ui-store";
import { useConversation } from "../hooks";
import { ChannelIcon } from "./conversation-badges";
import { ConversationControls } from "./conversation-controls";
import { MessageComposer } from "./message-composer";
import { MessageThread } from "./message-thread";

export function ConversationDetail({
  id,
  typingNames = [],
}: {
  id: string | null;
  typingNames?: string[];
}) {
  const conversation = useConversation(id);
  const aiPanelOpen = useUiStore((s) => s.aiPanelOpen);
  const toggleAiPanel = useUiStore((s) => s.toggleAiPanel);

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
            {detail.channel === "EMAIL" && detail.subject && (
              <>
                <span className="text-foreground font-medium">
                  {detail.subject}
                </span>
                {" · "}
              </>
            )}
            {formatDistanceToNow(
              new Date(detail.lastMessageAt ?? detail.updatedAt),
              { addSuffix: true },
            )}
          </p>
        </div>
        <ChannelIcon channel={detail.channel} />
        <ConversationControls detail={detail} />
        <Button
          variant={aiPanelOpen ? "secondary" : "ghost"}
          size="sm"
          aria-label="Toggle AI assistant"
          aria-pressed={aiPanelOpen}
          onClick={toggleAiPanel}
        >
          <Sparkles
            className={cn("size-4", aiPanelOpen && "text-primary")}
            aria-hidden
          />
          AI
        </Button>
      </div>

      <div className="flex min-h-0 flex-1">
        <div className="flex min-w-0 flex-1 flex-col">
          <MessageThread conversationId={detail.id} />

          {typingNames.length > 0 && (
            <p
              className="text-muted-foreground px-6 pb-1 text-xs italic"
              role="status"
              aria-live="polite"
            >
              {typingNames.join(", ")}{" "}
              {typingNames.length === 1 ? "is" : "are"} typing…
            </p>
          )}

          {detail.status === "RESOLVED" ? (
            <div className="text-muted-foreground flex items-center justify-center gap-2 border-t p-4 text-sm">
              <Lock className="size-4" aria-hidden />
              This conversation is resolved. Reopen it to reply.
            </div>
          ) : (
            <MessageComposer
              conversationId={detail.id}
              channel={detail.channel}
            />
          )}
        </div>

        {aiPanelOpen && <AiPanel conversationId={detail.id} />}
      </div>
    </div>
  );
}
