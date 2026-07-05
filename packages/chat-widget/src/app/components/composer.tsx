import { useEffect, useRef } from "preact/hooks";

interface ComposerProps {
  draft: string;
  sending: boolean;
  onDraftChange: (value: string) => void;
  onSend: (content: string) => void;
  onTypingStart: () => void;
  onTypingStop: () => void;
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

  const submit = () => {
    const trimmed = props.draft.trim();
    if (!trimmed || props.sending) return;
    stopTyping();
    props.onDraftChange("");
    props.onSend(trimmed);
  };

  return (
    <form
      className="helio-composer"
      onSubmit={(event) => {
        event.preventDefault();
        submit();
      }}
    >
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
        disabled={!props.draft.trim() || props.sending}
      >
        {props.sending ? (
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
    </form>
  );
}
