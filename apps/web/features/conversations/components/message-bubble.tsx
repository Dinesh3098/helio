import { format } from "date-fns";
import { Paperclip } from "lucide-react";
import { InitialsAvatar } from "@/components/shared/initials-avatar";
import { AttachmentView } from "@/features/attachments/components/attachment-view";
import { cn } from "@/lib/utils";
import type { Message, MessageAttachment } from "@/types/api";
import { isOptimistic } from "../hooks";

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function AttachmentChip({ attachment }: { attachment: MessageAttachment }) {
  const label = `${attachment.filename} (${formatSize(attachment.size)})`;
  const className =
    "bg-background/60 text-foreground/80 flex items-center gap-1.5 rounded-md border px-2 py-1 text-xs";

  // Metadata only — a URL renders a link, otherwise a plain chip.
  return attachment.url ? (
    <a
      href={attachment.url}
      target="_blank"
      rel="noopener noreferrer"
      className={cn(className, "hover:underline")}
    >
      <Paperclip className="size-3" aria-hidden />
      {label}
    </a>
  ) : (
    <span className={className}>
      <Paperclip className="size-3" aria-hidden />
      {label}
    </span>
  );
}

/** Agent (USER) messages align right; customer (CONTACT) messages left. */
export function MessageBubble({ message }: { message: Message }) {
  const isAgent = message.senderType === "USER";
  const senderName = message.senderName ?? (isAgent ? "Agent" : "Customer");
  const pending = isOptimistic(message);
  const email = message.metadata?.email;

  return (
    <div
      className={cn(
        "flex items-end gap-2",
        isAgent ? "flex-row-reverse" : "flex-row",
        pending && "opacity-60",
      )}
    >
      <InitialsAvatar name={senderName} className="mb-5 size-7" />
      <div
        className={cn(
          "flex max-w-[75%] flex-col gap-1",
          isAgent ? "items-end" : "items-start",
        )}
      >
        <div
          className={cn(
            "rounded-2xl px-3.5 py-2 text-sm whitespace-pre-wrap",
            isAgent
              ? "bg-primary text-primary-foreground rounded-br-sm"
              : "bg-muted rounded-bl-sm",
          )}
        >
          {email && (
            <p
              className={cn(
                "mb-1 border-b pb-1 text-xs",
                isAgent
                  ? "border-primary-foreground/20 text-primary-foreground/75"
                  : "border-foreground/10 text-muted-foreground",
              )}
            >
              ✉ {email.from} → {email.to}
              {email.subject && ` · ${email.subject}`}
            </p>
          )}
          {message.content}
          {message.metadata?.attachments &&
            message.metadata.attachments.length > 0 && (
              <div className="mt-2 flex flex-wrap gap-1.5">
                {message.metadata.attachments.map((attachment) => (
                  <AttachmentView
                    key={attachment.id ?? attachment.filename}
                    attachment={attachment}
                    inverted={isAgent}
                  />
                ))}
              </div>
            )}
          {email && email.attachments.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-1.5">
              {email.attachments.map((attachment) => (
                <AttachmentChip
                  key={`${attachment.filename}-${attachment.size}`}
                  attachment={attachment}
                />
              ))}
            </div>
          )}
        </div>
        <p className="text-muted-foreground px-1 text-xs">
          {senderName} ·{" "}
          {pending
            ? "Sending…"
            : email
              ? `Sent ${format(new Date(message.createdAt), "MMM d, p")}`
              : format(new Date(message.createdAt), "p")}
        </p>
      </div>
    </div>
  );
}
