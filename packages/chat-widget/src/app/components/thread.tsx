import { useEffect, useRef } from "preact/hooks";
import type { WidgetMessage } from "../types";

interface ThreadProps {
  messages: WidgetMessage[];
  typingNames: string[];
  hidden: boolean;
  nextCursor: string | null;
  loadingOlder: boolean;
  onLoadOlder: () => void;
  onRetryMessage: (message: WidgetMessage) => void;
}

function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function Thread(props: ThreadProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const lastId = props.messages[props.messages.length - 1]?.id;

  // Follow the newest message; also snap down on restore from minimize.
  useEffect(() => {
    const el = scrollRef.current;
    if (el && !props.hidden) {
      el.scrollTop = el.scrollHeight;
    }
  }, [lastId, props.typingNames.length, props.hidden]);

  return (
    <div ref={scrollRef} className="helio-thread" aria-label="Messages">
      {props.nextCursor && (
        <button
          type="button"
          className="helio-load-older"
          disabled={props.loadingOlder}
          onClick={props.onLoadOlder}
        >
          {props.loadingOlder ? "Loading…" : "Load earlier messages"}
        </button>
      )}

      {props.messages.length === 0 && (
        <div className="helio-empty">
          <p className="helio-state-title">Start the conversation</p>
          <p className="helio-state-text">
            Send us a message and we'll get right back to you.
          </p>
        </div>
      )}

      {props.messages.map((message) => {
        const mine = message.senderType === "CONTACT";
        return (
          <div
            key={message.id}
            className={`helio-row ${mine ? "helio-row--mine" : "helio-row--theirs"}`}
          >
            <div
              className={`helio-bubble ${
                mine ? "helio-bubble--mine" : "helio-bubble--theirs"
              }${message.pending ? " helio-bubble--pending" : ""}${
                message.failed ? " helio-bubble--failed" : ""
              }`}
            >
              {message.content}
            </div>
            <span className="helio-meta">
              {!mine && message.senderName ? `${message.senderName} · ` : ""}
              {message.pending ? "Sending…" : formatTime(message.createdAt)}
              {message.failed && (
                <>
                  {" · "}
                  <button
                    type="button"
                    className="helio-retry-link"
                    onClick={() => props.onRetryMessage(message)}
                  >
                    Failed — retry
                  </button>
                </>
              )}
            </span>
          </div>
        );
      })}

      {props.typingNames.length > 0 && (
        <div className="helio-row helio-row--theirs">
          <div
            className="helio-bubble helio-bubble--theirs helio-typing"
            role="status"
            aria-label={`${props.typingNames.join(", ")} is typing`}
          >
            <span className="helio-dot" />
            <span className="helio-dot" />
            <span className="helio-dot" />
          </div>
        </div>
      )}
    </div>
  );
}
