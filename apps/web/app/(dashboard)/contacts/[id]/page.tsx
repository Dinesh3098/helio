"use client";

import { format, formatDistanceToNow } from "date-fns";
import { ArrowLeft, MessagesSquare } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { use } from "react";
import { EmptyState } from "@/components/shared/empty-state";
import { ErrorState } from "@/components/shared/error-state";
import { InitialsAvatar } from "@/components/shared/initials-avatar";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { useContact, useContactConversations } from "@/features/contacts/hooks";
import { EditContactDialog } from "@/features/contacts/components/edit-contact-dialog";
import {
  ChannelIcon,
  StatusBadge,
} from "@/features/conversations/components/conversation-badges";
import { useUiStore } from "@/stores/ui-store";

export default function ContactDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const router = useRouter();
  const contact = useContact(id);
  const conversations = useContactConversations(id);
  const selectConversation = useUiStore((s) => s.selectConversation);

  const openInInbox = (conversationId: string) => {
    selectConversation(conversationId);
    router.push("/inbox");
  };

  return (
    <div className="mx-auto max-w-5xl space-y-6 p-6">
      <Button variant="ghost" size="sm" asChild>
        <Link href="/contacts">
          <ArrowLeft className="size-4" aria-hidden />
          Back to contacts
        </Link>
      </Button>

      {contact.isPending ? (
        <div className="space-y-4">
          <div className="flex items-center gap-4">
            <Skeleton className="size-14 rounded-full" />
            <div className="space-y-2">
              <Skeleton className="h-5 w-48" />
              <Skeleton className="h-4 w-64" />
            </div>
          </div>
          <div className="grid gap-4 sm:grid-cols-3">
            {Array.from({ length: 3 }).map((_, i) => (
              <Skeleton key={i} className="h-24 w-full" />
            ))}
          </div>
        </div>
      ) : contact.isError ? (
        <ErrorState error={contact.error} onRetry={contact.refetch} />
      ) : (
        <>
          <div className="flex flex-wrap items-center gap-4">
            <InitialsAvatar name={contact.data.name} className="size-14" />
            <div className="min-w-0 flex-1">
              <h1 className="text-xl font-semibold tracking-tight">
                {contact.data.name}
              </h1>
              <p className="text-muted-foreground text-sm">
                {[contact.data.email, contact.data.phone]
                  .filter(Boolean)
                  .join(" · ") || "No contact details"}
              </p>
            </div>
            <EditContactDialog contact={contact.data} />
          </div>

          <div className="grid gap-4 sm:grid-cols-3">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-muted-foreground text-sm font-medium">
                  Total conversations
                </CardTitle>
              </CardHeader>
              <CardContent className="text-2xl font-semibold">
                {contact.data.totalConversations}
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-muted-foreground text-sm font-medium">
                  Open conversations
                </CardTitle>
              </CardHeader>
              <CardContent className="text-2xl font-semibold">
                {contact.data.openConversations}
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-muted-foreground text-sm font-medium">
                  Last activity
                </CardTitle>
              </CardHeader>
              <CardContent className="text-2xl font-semibold">
                {contact.data.lastConversationAt
                  ? formatDistanceToNow(
                      new Date(contact.data.lastConversationAt),
                      { addSuffix: true },
                    )
                  : "—"}
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader>
              <CardTitle>Conversations</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              {conversations.isPending ? (
                <div className="space-y-2 p-6 pt-0">
                  {Array.from({ length: 3 }).map((_, i) => (
                    <Skeleton key={i} className="h-14 w-full" />
                  ))}
                </div>
              ) : conversations.isError ? (
                <ErrorState
                  error={conversations.error}
                  onRetry={conversations.refetch}
                />
              ) : conversations.data.data.length === 0 ? (
                <EmptyState
                  icon={MessagesSquare}
                  title="No conversations yet"
                  description="This contact hasn't started a conversation."
                />
              ) : (
                <ul className="divide-y border-t">
                  {conversations.data.data.map((conversation) => (
                    <li key={conversation.id}>
                      <button
                        type="button"
                        onClick={() => openInInbox(conversation.id)}
                        className="hover:bg-accent/60 flex w-full items-center gap-3 px-6 py-3 text-left transition-colors"
                      >
                        <ChannelIcon channel={conversation.channel} />
                        <span className="min-w-0 flex-1 truncate text-sm">
                          {conversation.lastMessagePreview ??
                            conversation.subject ??
                            "No messages yet"}
                        </span>
                        <StatusBadge status={conversation.status} />
                        <span className="text-muted-foreground shrink-0 text-xs">
                          {format(
                            new Date(
                              conversation.lastMessageAt ??
                                conversation.updatedAt,
                            ),
                            "MMM d, yyyy",
                          )}
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
