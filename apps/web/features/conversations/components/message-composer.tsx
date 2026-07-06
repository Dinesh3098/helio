"use client";

import { Loader2, Paperclip, SendHorizonal } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { UploadTray } from "@/features/attachments/components/upload-tray";
import { useUploadManager } from "@/features/attachments/use-upload-manager";
import { getSocket, REALTIME } from "@/lib/realtime/socket";
import { cn } from "@/lib/utils";
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
  // Outbound email attachments aren't wired to the provider yet.
  const attachmentsEnabled = channel === "CHAT";
  const uploadManager = useUploadManager(conversationId);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [dragActive, setDragActive] = useState(false);
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
    if (send.isPending || uploadManager.busy) return;
    const attachmentIds = uploadManager.readyIds;
    // Text or files — either alone is a valid message.
    if (!trimmed && attachmentIds.length === 0) return;
    const optimisticAttachments = uploadManager.uploads
      .filter((u) => u.status === "done")
      .map((u) => ({
        id: u.attachmentId,
        filename: u.file.name,
        mimeType: u.file.type,
        size: u.file.size,
        url: null,
      }));
    stopTyping();
    // Clear immediately for the optimistic flow; restore the draft if the
    // server rejects the message so nothing typed is lost.
    setContent("");
    uploadManager.clear();
    send.mutate(
      { content: trimmed, attachmentIds, optimisticAttachments },
      { onError: () => setContent(trimmed) },
    );
  };

  return (
    <div
      className={cn(
        "border-t transition-colors",
        dragActive && "bg-primary/5 outline-primary/40 outline-2 -outline-offset-2 outline-dashed",
      )}
      onDragOver={(e) => {
        if (!attachmentsEnabled) return;
        e.preventDefault();
        setDragActive(true);
      }}
      onDragLeave={() => setDragActive(false)}
      onDrop={(e) => {
        if (!attachmentsEnabled) return;
        e.preventDefault();
        setDragActive(false);
        if (e.dataTransfer.files.length) {
          uploadManager.addFiles(e.dataTransfer.files);
        }
      }}
    >
      <UploadTray
        uploads={uploadManager.uploads}
        onRemove={uploadManager.remove}
        onRetry={uploadManager.retry}
      />

      <form
        className="flex items-end gap-2 p-4"
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
      >
        {attachmentsEnabled && (
          <>
            <input
              ref={fileInputRef}
              type="file"
              multiple
              hidden
              accept="image/png,image/jpeg,image/gif,image/webp,application/pdf,.doc,.docx,.txt,.csv"
              onChange={(e) => {
                if (e.target.files?.length) {
                  uploadManager.addFiles(e.target.files);
                }
                e.target.value = "";
              }}
            />
            <Button
              type="button"
              variant="ghost"
              size="icon"
              aria-label="Attach files"
              title="Attach files (or drag and drop)"
              onClick={() => fileInputRef.current?.click()}
            >
              <Paperclip className="size-4" aria-hidden />
            </Button>
          </>
        )}

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
          title={
            uploadManager.busy ? "Waiting for uploads to finish" : undefined
          }
          disabled={
            (!content.trim() && uploadManager.readyIds.length === 0) ||
            send.isPending ||
            uploadManager.busy
          }
        >
          {send.isPending || uploadManager.busy ? (
            <Loader2 className="animate-spin" aria-hidden />
          ) : (
            <SendHorizonal className="size-4" aria-hidden />
          )}
        </Button>
      </form>
    </div>
  );
}
