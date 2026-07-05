import { Mail, MessageSquare } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type { ConversationChannel, ConversationStatus } from "@/types/api";

const STATUS_STYLES: Record<ConversationStatus, string> = {
  OPEN: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400",
  SNOOZED: "bg-amber-500/15 text-amber-700 dark:text-amber-400",
  RESOLVED: "bg-muted text-muted-foreground",
};

const STATUS_LABELS: Record<ConversationStatus, string> = {
  OPEN: "Open",
  SNOOZED: "Snoozed",
  RESOLVED: "Resolved",
};

export function StatusBadge({ status }: { status: ConversationStatus }) {
  return (
    <Badge className={cn("border-transparent", STATUS_STYLES[status])}>
      {STATUS_LABELS[status]}
    </Badge>
  );
}

export function ChannelIcon({
  channel,
  className,
}: {
  channel: ConversationChannel;
  className?: string;
}) {
  const Icon = channel === "EMAIL" ? Mail : MessageSquare;
  return (
    <Icon
      className={cn("text-muted-foreground size-4", className)}
      aria-label={channel === "EMAIL" ? "Email" : "Live chat"}
    />
  );
}
