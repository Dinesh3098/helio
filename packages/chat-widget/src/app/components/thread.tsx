import { useEffect, useRef, useState } from "preact/hooks";
import { fetchAttachmentBlobUrl } from "../api";
import type { HelioWidgetConfig } from "../../shared/config";
import type { WidgetAttachment, WidgetMessage, WidgetSession } from "../types";

interface ThreadProps {
  messages: WidgetMessage[];
  typingNames: string[];
  hidden: boolean;
  nextCursor: string | null;
  loadingOlder: boolean;
  session: WidgetSession | null;
  config: HelioWidgetConfig;
  onLoadOlder: () => void;
  onRetryMessage: (message: WidgetMessage) => void;
}

/** Module-level cache so previews survive re-renders and re-opens. */
const blobUrlCache = new Map<string, string>();

function AttachmentChip({
  attachment,
  config,
  session,
}: {
  attachment: WidgetAttachment;
  config: HelioWidgetConfig;
  session: WidgetSession | null;
}) {
  const isImage = attachment.mimeType.startsWith("image/");
  const [previewUrl, setPreviewUrl] = useState<string | null>(
    attachment.id ? (blobUrlCache.get(attachment.id) ?? null) : null,
  );

  useEffect(() => {
    if (!isImage || !attachment.id || previewUrl || !session) return;
    let cancelled = false;
    fetchAttachmentBlobUrl(config, session.visitorToken, attachment.id)
      .then((url) => {
        blobUrlCache.set(attachment.id as string, url);
        if (!cancelled) setPreviewUrl(url);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [attachment.id, config, isImage, previewUrl, session]);

  const download = async () => {
    if (!attachment.id || !session) return;
    const url =
      blobUrlCache.get(attachment.id) ??
      (await fetchAttachmentBlobUrl(
        config,
        session.visitorToken,
        attachment.id,
      ));
    blobUrlCache.set(attachment.id, url);
    const link = document.createElement("a");
    link.href = url;
    link.download = attachment.filename;
    link.click();
  };

  if (isImage && previewUrl) {
    return (
      <button
        type="button"
        className="helio-att-image"
        title={`Download ${attachment.filename}`}
        onClick={() => void download()}
      >
        <img src={previewUrl} alt={attachment.filename} />
      </button>
    );
  }

  const sizeKb =
    attachment.size < 1024 * 1024
      ? `${Math.round(attachment.size / 1024)} KB`
      : `${(attachment.size / (1024 * 1024)).toFixed(1)} MB`;
  return (
    <button
      type="button"
      className="helio-att-file"
      disabled={!attachment.id}
      onClick={() => void download()}
    >
      📎 {attachment.filename} <small>({sizeKb})</small>
    </button>
  );
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
              {message.metadata?.attachments &&
                message.metadata.attachments.length > 0 && (
                  <div className="helio-att-list">
                    {message.metadata.attachments.map((attachment) => (
                      <AttachmentChip
                        key={attachment.id ?? attachment.filename}
                        attachment={attachment}
                        config={props.config}
                        session={props.session}
                      />
                    ))}
                  </div>
                )}
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
