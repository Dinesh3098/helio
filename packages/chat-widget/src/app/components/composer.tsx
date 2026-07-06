import { useEffect, useRef } from "preact/hooks";
import type { WidgetUpload } from "../widget";

interface ComposerProps {
  draft: string;
  sending: boolean;
  uploads: WidgetUpload[];
  onAddFiles: (files: FileList) => void;
  onRemoveUpload: (localId: string) => void;
  onRetryUpload: (localId: string) => void;
  onDraftChange: (value: string) => void;
  onSend: (content: string) => void;
  onTypingStart: () => void;
  onTypingStop: () => void;
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

const TYPING_REEMIT_MS = 2000;
const TYPING_IDLE_MS = 2500;

export function Composer(props: ComposerProps) {
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
      props.onTypingStop();
    }
  };

  const emitTyping = () => {
    const typing = typingRef.current;
    const now = Date.now();
    if (now - typing.lastSentAt > TYPING_REEMIT_MS) {
      props.onTypingStart();
      typing.lastSentAt = now;
    }
    if (typing.idleTimer) clearTimeout(typing.idleTimer);
    typing.idleTimer = setTimeout(stopTyping, TYPING_IDLE_MS);
  };

  // Unmount must not strand a typing indicator on the agent's side.
  useEffect(() => stopTyping, []);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const uploading = props.uploads.some((u) => u.status === "uploading");
  const hasReadyFiles = props.uploads.some((u) => u.status === "done");

  const submit = () => {
    const trimmed = props.draft.trim();
    if ((!trimmed && !hasReadyFiles) || props.sending || uploading) return;
    stopTyping();
    props.onDraftChange("");
    props.onSend(trimmed);
  };

  return (
    <form
      className="helio-composer-wrap"
      onSubmit={(event) => {
        event.preventDefault();
        submit();
      }}
    >
      {props.uploads.length > 0 && (
        <div className="helio-upload-tray">
          {props.uploads.map((upload) => (
            <span
              key={upload.localId}
              className={`helio-upload-chip${upload.status === "error" ? " helio-upload-chip--error" : ""}`}
            >
              {upload.status === "uploading" && (
                <span
                  className="helio-upload-progress"
                  style={{ width: `${Math.round(upload.progress * 100)}%` }}
                  aria-hidden
                />
              )}
              <span className="helio-upload-name">
                📎 {upload.filename}
                <small>
                  {upload.status === "uploading"
                    ? ` ${Math.round(upload.progress * 100)}%`
                    : upload.status === "error"
                      ? ` ${upload.error ?? "failed"}`
                      : ` ${formatSize(upload.size)}`}
                </small>
              </span>
              {upload.status === "error" && (
                <button
                  type="button"
                  className="helio-upload-action"
                  aria-label={`Retry ${upload.filename}`}
                  onClick={() => props.onRetryUpload(upload.localId)}
                >
                  ↻
                </button>
              )}
              <button
                type="button"
                className="helio-upload-action"
                aria-label={`Remove ${upload.filename}`}
                onClick={() => props.onRemoveUpload(upload.localId)}
              >
                ×
              </button>
            </span>
          ))}
        </div>
      )}
      <div className="helio-composer">
      <input
        ref={fileInputRef}
        type="file"
        multiple
        hidden
        accept="image/png,image/jpeg,image/gif,image/webp,application/pdf,.doc,.docx,.txt,.csv"
        onChange={(event) => {
          const input = event.target as HTMLInputElement;
          if (input.files?.length) props.onAddFiles(input.files);
          input.value = "";
        }}
      />
      <button
        type="button"
        className="helio-attach"
        aria-label="Attach a file"
        onClick={() => fileInputRef.current?.click()}
      >
        <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <path
            d="M21 12.5l-8.5 8.5a6 6 0 01-8.5-8.5L12.5 4a4 4 0 015.7 5.7L9.7 18.2a2 2 0 01-2.9-2.9l7.8-7.8"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
          />
        </svg>
      </button>
      <textarea
        className="helio-input"
        rows={1}
        maxLength={10000}
        placeholder="Write a message…"
        aria-label="Message"
        value={props.draft}
        onInput={(event) => {
          const value = (event.target as HTMLTextAreaElement).value;
          props.onDraftChange(value);
          if (value) emitTyping();
          else stopTyping();
        }}
        onKeyDown={(event) => {
          if (event.key === "Enter" && !event.shiftKey) {
            event.preventDefault();
            submit();
          }
        }}
      />
      <button
        type="submit"
        className="helio-send"
        aria-label="Send message"
        disabled={
          (!props.draft.trim() && !hasReadyFiles) ||
          props.sending ||
          uploading
        }
      >
        {props.sending || uploading ? (
          <span className="helio-spinner" role="status" aria-label="Sending" />
        ) : (
          <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <path
              d="M4 12l16-7-4.5 7L20 19 4 12Z"
              fill="currentColor"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinejoin="round"
            />
          </svg>
        )}
      </button>
      </div>
    </form>
  );
}
