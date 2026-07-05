"use client";

import { Loader2, MessagesSquare } from "lucide-react";
import { useEffect, useLayoutEffect, useRef } from "react";
import { EmptyState } from "@/components/shared/empty-state";
import { ErrorState } from "@/components/shared/error-state";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { flatMessages, useMessages } from "../hooks";
import { MessageBubble } from "./message-bubble";

export function MessageThread({ conversationId }: { conversationId: string }) {
  const query = useMessages(conversationId);
  const messages = flatMessages(query.data);

  const scrollRef = useRef<HTMLDivElement>(null);
  // Set right before loading an older page so the layout effect can keep
  // the viewport anchored while content is prepended above it.
  const prependHeightRef = useRef<number | null>(null);

  const lastMessageId = messages.at(-1)?.id;

  // New message at the bottom (initial load, send, optimistic append) →
  // follow it. Loading older pages never changes the last id.
  useEffect(() => {
    const el = scrollRef.current;
    if (el && lastMessageId) {
      el.scrollTop = el.scrollHeight;
    }
  }, [lastMessageId]);

  useLayoutEffect(() => {
    const el = scrollRef.current;
    if (el && prependHeightRef.current !== null) {
      el.scrollTop += el.scrollHeight - prependHeightRef.current;
      prependHeightRef.current = null;
    }
  }, [messages.length]);

  const loadOlder = () => {
    prependHeightRef.current = scrollRef.current?.scrollHeight ?? null;
    void query.fetchNextPage();
  };

  if (query.isPending) {
    return (
      <div className="flex-1 space-y-4 overflow-y-auto p-6">
        {Array.from({ length: 4 }).map((_, i) => (
          <div
            key={i}
            className={cn("flex", i % 2 ? "justify-end" : "justify-start")}
          >
            <Skeleton className="h-14 w-2/5 rounded-2xl" />
          </div>
        ))}
      </div>
    );
  }

  if (query.isError) {
    return (
      <div className="flex-1">
        <ErrorState error={query.error} onRetry={query.refetch} />
      </div>
    );
  }

  if (messages.length === 0) {
    return (
      <div className="flex-1">
        <EmptyState
          icon={MessagesSquare}
          title="No messages yet"
          description="Send the first reply to start the thread."
        />
      </div>
    );
  }

  return (
    <div
      ref={scrollRef}
      className="min-h-0 flex-1 overflow-y-auto"
      aria-label="Message thread"
    >
      <div className="mx-auto flex max-w-3xl flex-col gap-4 p-6">
        {query.hasNextPage && (
          <Button
            variant="outline"
            size="sm"
            className="mx-auto"
            disabled={query.isFetchingNextPage}
            onClick={loadOlder}
          >
            {query.isFetchingNextPage && (
              <Loader2 className="animate-spin" aria-hidden />
            )}
            Load older messages
          </Button>
        )}
        {messages.map((message) => (
          <MessageBubble key={message.id} message={message} />
        ))}
      </div>
    </div>
  );
}
