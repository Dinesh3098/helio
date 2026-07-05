"use client";

import { Loader2, SendHorizonal } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { useSendMessage } from "../hooks";

export function MessageComposer({ conversationId }: { conversationId: string }) {
  const [content, setContent] = useState("");
  const send = useSendMessage(conversationId);

  const submit = () => {
    const trimmed = content.trim();
    if (!trimmed || send.isPending) return;
    // Clear immediately for the optimistic flow; restore the draft if the
    // server rejects the message so nothing typed is lost.
    setContent("");
    send.mutate(trimmed, { onError: () => setContent(trimmed) });
  };

  return (
    <form
      className="flex items-end gap-2 border-t p-4"
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
    >
      <Textarea
        value={content}
        onChange={(e) => setContent(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            submit();
          }
        }}
        placeholder="Write a reply… (Enter to send, Shift+Enter for a new line)"
        aria-label="Message"
        rows={2}
        className="max-h-40 resize-none"
      />
      <Button
        type="submit"
        size="icon"
        aria-label="Send message"
        disabled={!content.trim() || send.isPending}
      >
        {send.isPending ? (
          <Loader2 className="animate-spin" aria-hidden />
        ) : (
          <SendHorizonal className="size-4" aria-hidden />
        )}
      </Button>
    </form>
  );
}
