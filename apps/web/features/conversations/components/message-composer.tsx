"use client";

import { Loader2, SendHorizonal } from "lucide-react";
import { useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { getSocket, REALTIME } from "@/lib/realtime/socket";
import { useUiStore } from "@/stores/ui-store";
import type { ConversationChannel } from "@/types/api";
import { useSendMessage } from "../hooks";

const TYPING_REEMIT_MS = 2000;
const TYPING_IDLE_MS = 2500;

export function MessageComposer({
  conversationId,
  channel = "CHAT",
}: {
  conversationId: string;
  channel?: ConversationChannel;
}) {
  // Draft lives in the UI store so the AI panel can insert/rewrite it.
  const content = useUiStore((s) => s.composerDraft);
  const setContent = useUiStore((s) => s.setComposerDraft);
  const send = useSendMessage(conversationId, channel);
  const typingRef = useRef<{
    lastSentAt: number;
    idleTimer: ReturnType<typeof setTimeout> | null;
  }>({ lastSentAt: 0, idleTimer: null });

  const stopTyping = () => {
    const typing = typingRef.current;
    if (typing.idleTimer) clearTimeout(typing.idleTimer);
    typing.idleTimer = null;
    if (typing.lastSentAt) {
      typing.lastSentAt = 0;
      const socket = getSocket();
      if (socket.connected) {
        socket.emit(REALTIME.typingStop, { conversationId });
      }
    }
  };

  /** Transient only: re-emitted at most every 2s, auto-stopped when idle. */
  const emitTyping = () => {
    // Typing indicators are meaningless over email.
    if (channel === "EMAIL") return;
    const socket = getSocket();
    if (!socket.connected) return;
    const typing = typingRef.current;
    const now = Date.now();
    if (now - typing.lastSentAt > TYPING_REEMIT_MS) {
      socket.emit(REALTIME.typingStart, { conversationId });
      typing.lastSentAt = now;
    }
    if (typing.idleTimer) clearTimeout(typing.idleTimer);
    typing.idleTimer = setTimeout(stopTyping, TYPING_IDLE_MS);
  };

  // Leaving the conversation (or unmount) must not strand a typing state.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => stopTyping, [conversationId]);

  const submit = () => {
    const trimmed = content.trim();
    if (!trimmed || send.isPending) return;
    stopTyping();
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
        onChange={(e) => {
          setContent(e.target.value);
          if (e.target.value) emitTyping();
          else stopTyping();
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            submit();
          }
        }}
        placeholder={
          channel === "EMAIL"
            ? "Write an email reply… (Enter to send, Shift+Enter for a new line)"
            : "Write a reply… (Enter to send, Shift+Enter for a new line)"
        }
        aria-label="Message"
        rows={2}
        maxLength={10_000}
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
