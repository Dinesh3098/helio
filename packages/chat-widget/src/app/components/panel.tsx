import { useEffect, useRef } from "preact/hooks";
import type { HelioWidgetConfig } from "../../shared/config";
import type { WidgetMessage, WidgetSession } from "../types";
import type { WidgetUpload } from "../widget";
import { Composer } from "./composer";
import { Thread } from "./thread";

interface PanelProps {
  hidden: boolean;
  status: "loading" | "ready" | "error";
  workspaceName: string;
  messages: WidgetMessage[];
  typingNames: string[];
  nextCursor: string | null;
  loadingOlder: boolean;
  draft: string;
  sending: boolean;
  uploads: WidgetUpload[];
  onAddFiles: (files: FileList) => void;
  onRemoveUpload: (localId: string) => void;
  onRetryUpload: (localId: string) => void;
  session: WidgetSession | null;
  config: HelioWidgetConfig;
  onDraftChange: (value: string) => void;
  onSend: (content: string) => void;
  onRetryBoot: () => void;
  onRetryMessage: (message: WidgetMessage) => void;
  onLoadOlder: () => void;
  onTypingStart: () => void;
  onTypingStop: () => void;
  onMinimize: () => void;
  onClose: () => void;
}

const FOCUSABLE =
  'button, [href], input, textarea, [tabindex]:not([tabindex="-1"])';

export function Panel(props: PanelProps) {
  const panelRef = useRef<HTMLDivElement>(null);

  // Focus the composer whenever the panel is shown.
  useEffect(() => {
    if (props.hidden) return;
    const textarea = panelRef.current?.querySelector("textarea");
    textarea?.focus();
  }, [props.hidden, props.status]);

  /** Focus trap + Escape-to-close, scoped to the panel. */
  const onKeyDown = (event: KeyboardEvent) => {
    if (event.key === "Escape") {
      event.stopPropagation();
      props.onClose();
      return;
    }
    if (event.key !== "Tab" || !panelRef.current) return;

    const focusables = [
      ...panelRef.current.querySelectorAll<HTMLElement>(FOCUSABLE),
    ].filter((el) => !el.hasAttribute("disabled"));
    if (focusables.length === 0) return;

    const first = focusables[0] as HTMLElement;
    const last = focusables[focusables.length - 1] as HTMLElement;
    const active = (panelRef.current.getRootNode() as ShadowRoot)
      .activeElement as HTMLElement | null;

    if (event.shiftKey && active === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && active === last) {
      event.preventDefault();
      first.focus();
    }
  };

  return (
    <div
      ref={panelRef}
      className={`helio-panel${props.hidden ? " helio-panel--hidden" : ""}`}
      role="dialog"
      aria-modal="false"
      aria-label={`Chat with ${props.workspaceName}`}
      onKeyDown={onKeyDown}
    >
      <header className="helio-header">
        <div className="helio-header-info">
          <p className="helio-header-title">{props.workspaceName}</p>
          <p className="helio-header-subtitle">
            We typically reply in a few minutes
          </p>
        </div>
        <button
          type="button"
          className="helio-icon-btn"
          aria-label="Minimize chat"
          onClick={props.onMinimize}
        >
          <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <path
              d="M5 12h14"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
            />
          </svg>
        </button>
        <button
          type="button"
          className="helio-icon-btn"
          aria-label="Close chat"
          onClick={props.onClose}
        >
          <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <path
              d="M6 6l12 12M18 6L6 18"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
            />
          </svg>
        </button>
      </header>

      {props.status === "loading" && (
        <div className="helio-state" role="status" aria-label="Loading chat">
          <span className="helio-dot" />
          <span className="helio-dot" />
          <span className="helio-dot" />
        </div>
      )}

      {props.status === "error" && (
        <div className="helio-state">
          <p className="helio-state-title">We couldn't start the chat</p>
          <p className="helio-state-text">
            Check your connection and try again.
          </p>
          <button
            type="button"
            className="helio-retry"
            onClick={props.onRetryBoot}
          >
            Try again
          </button>
        </div>
      )}

      {props.status === "ready" && (
        <>
          <Thread
            messages={props.messages}
            typingNames={props.typingNames}
            hidden={props.hidden}
            nextCursor={props.nextCursor}
            loadingOlder={props.loadingOlder}
            session={props.session}
            config={props.config}
            onLoadOlder={props.onLoadOlder}
            onRetryMessage={props.onRetryMessage}
          />
          <Composer
            draft={props.draft}
            sending={props.sending}
            uploads={props.uploads}
            onAddFiles={props.onAddFiles}
            onRemoveUpload={props.onRemoveUpload}
            onRetryUpload={props.onRetryUpload}
            onDraftChange={props.onDraftChange}
            onSend={props.onSend}
            onTypingStart={props.onTypingStart}
            onTypingStop={props.onTypingStop}
          />
        </>
      )}
    </div>
  );
}
