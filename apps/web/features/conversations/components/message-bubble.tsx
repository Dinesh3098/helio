import { format } from "date-fns";
import { InitialsAvatar } from "@/components/shared/initials-avatar";
import { cn } from "@/lib/utils";
import type { Message } from "@/types/api";
import { isOptimistic } from "../hooks";

/** Agent (USER) messages align right; customer (CONTACT) messages left. */
export function MessageBubble({ message }: { message: Message }) {
  const isAgent = message.senderType === "USER";
  const senderName = message.senderName ?? (isAgent ? "Agent" : "Customer");
  const pending = isOptimistic(message);

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
          {message.content}
        </div>
        <p className="text-muted-foreground px-1 text-xs">
          {senderName} ·{" "}
          {pending ? "Sending…" : format(new Date(message.createdAt), "p")}
        </p>
      </div>
    </div>
  );
}
