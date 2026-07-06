import { useCallback, useEffect, useRef, useState } from "preact/hooks";
import type { Socket } from "socket.io-client";
import type { HelioWidgetConfig } from "../shared/config";
import {
  createSession,
  fetchMessages,
  sendMessageRest,
  uploadAttachment,
  type UploadHandle,
} from "./api";
import { Panel } from "./components/panel";
import {
  createSocket,
  EVENTS,
  sendViaSocket,
  type TypingEvent,
} from "./realtime";
import { getOrCreateVisitorId } from "./storage";
import type { WidgetMessage, WidgetSession } from "./types";

export interface WidgetUpload {
  localId: string;
  filename: string;
  size: number;
  progress: number;
  status: "uploading" | "done" | "error";
  error?: string;
  attachmentId?: string;
  file: File;
}

type BootStatus = "loading" | "ready" | "error";

function sortByTime(messages: WidgetMessage[]): WidgetMessage[] {
  return [...messages].sort(
    (a, b) =>
      a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id),
  );
}

export function Widget({ config }: { config: HelioWidgetConfig }) {
  // Mounted by the loader on first click, so the panel starts open.
  const [open, setOpen] = useState(true);
  const [status, setStatus] = useState<BootStatus>("loading");
  const [session, setSession] = useState<WidgetSession | null>(null);
  const [messages, setMessages] = useState<WidgetMessage[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [typingAgents, setTypingAgents] = useState<Record<string, string>>({});
  const [unread, setUnread] = useState(0);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [uploads, setUploads] = useState<WidgetUpload[]>([]);
  const uploadHandlesRef = useRef(new Map<string, UploadHandle>());

  const socketRef = useRef<Socket | null>(null);
  const connectedOnceRef = useRef(false);
  const openRef = useRef(open);
  openRef.current = open;
  const sessionRef = useRef(session);
  sessionRef.current = session;

  /** Insert with id-dedupe (ack and room broadcast can race). */
  const upsertMessage = useCallback(
    (message: WidgetMessage, removeId?: string) => {
      setMessages((current) => {
        const next = removeId
          ? current.filter((m) => m.id !== removeId)
          : current;
        if (next.some((m) => m.id === message.id)) return next;
        return [...next, message];
      });
    },
    [],
  );

  /** Reconnect recovery: fold a fresh page in without duplicating. */
  const mergeMessages = useCallback((incoming: WidgetMessage[]) => {
    setMessages((current) => {
      const byId = new Map(current.map((m) => [m.id, m]));
      for (const message of incoming) byId.set(message.id, message);
      return sortByTime([...byId.values()]);
    });
  }, []);

  const removeTypingAgent = useCallback((userId: string) => {
    setTypingAgents((current) => {
      if (!(userId in current)) return current;
      const next = { ...current };
      delete next[userId];
      return next;
    });
  }, []);

  const connectSocket = useCallback(
    (sess: WidgetSession) => {
      socketRef.current?.removeAllListeners();
      socketRef.current?.disconnect();

      const socket = createSocket(config, sess.visitorToken);
      socketRef.current = socket;

      socket.on("connect", () => {
        socket.emit(EVENTS.joinConversation, {
          conversationId: sess.conversation.id,
        });
        if (connectedOnceRef.current) {
          // Recover anything missed while offline; merge dedupes.
          fetchMessages(config, sess.visitorToken)
            .then((page) => mergeMessages(page.data))
            .catch(() => undefined);
        }
        connectedOnceRef.current = true;
      });

      socket.on(EVENTS.messageCreated, (message: WidgetMessage) => {
        upsertMessage(message);
        if (message.senderId) removeTypingAgent(message.senderId);
        if (message.senderType === "USER" && !openRef.current) {
          setUnread((count) => count + 1);
        }
      });

      socket.on(EVENTS.typingStarted, (event: TypingEvent) => {
        if (event.conversationId !== sess.conversation.id) return;
        setTypingAgents((current) => ({
          ...current,
          [event.userId]: event.name,
        }));
      });

      socket.on(EVENTS.typingStopped, (event: TypingEvent) => {
        removeTypingAgent(event.userId);
      });
    },
    [config, mergeMessages, removeTypingAgent, upsertMessage],
  );

  /** Session bootstrap + history + socket. Also the error-state retry. */
  const boot = useCallback(async () => {
    setStatus("loading");
    try {
      const visitorId = getOrCreateVisitorId(config.workspaceId);
      const sess = await createSession(config, visitorId);
      setSession(sess);
      const page = await fetchMessages(config, sess.visitorToken);
      setMessages(sortByTime(page.data));
      setNextCursor(page.nextCursor);
      connectSocket(sess);
      setStatus("ready");
    } catch {
      setStatus("error");
    }
  }, [config, connectSocket]);

  useEffect(() => {
    void boot();
    return () => {
      socketRef.current?.removeAllListeners();
      socketRef.current?.disconnect();
    };
  }, []);

  /**
   * When an agent resolved the thread, a new session yields a fresh
   * conversation — the widget swaps to it transparently.
   */
  const refreshSession = useCallback(async (): Promise<WidgetSession> => {
    const visitorId = getOrCreateVisitorId(config.workspaceId);
    const sess = await createSession(config, visitorId);
    setSession(sess);
    const page = await fetchMessages(config, sess.visitorToken);
    setMessages(sortByTime(page.data));
    setNextCursor(page.nextCursor);
    connectSocket(sess);
    return sess;
  }, [config, connectSocket]);

  const deliver = useCallback(
    (
      sess: WidgetSession,
      content: string,
      attachmentIds?: string[],
    ): Promise<WidgetMessage> => {
      const socket = socketRef.current;
      if (socket?.connected) {
        return sendViaSocket(
          socket,
          sess.conversation.id,
          content,
          attachmentIds,
        );
      }
      return sendMessageRest(config, sess.visitorToken, content, attachmentIds);
    },
    [config],
  );

  const patchUpload = useCallback(
    (localId: string, changes: Partial<WidgetUpload>) => {
      setUploads((current) =>
        current.map((u) => (u.localId === localId ? { ...u, ...changes } : u)),
      );
    },
    [],
  );

  const startUpload = useCallback(
    (localId: string, file: File) => {
      const sess = sessionRef.current;
      if (!sess) return;
      patchUpload(localId, {
        status: "uploading",
        progress: 0,
        error: undefined,
      });
      const handle = uploadAttachment(config, sess.visitorToken, file, (p) =>
        patchUpload(localId, { progress: p }),
      );
      uploadHandlesRef.current.set(localId, handle);
      handle.promise
        .then((attachment) =>
          patchUpload(localId, {
            status: "done",
            progress: 1,
            attachmentId: attachment.id,
          }),
        )
        .catch((error: Error) => {
          if (error.message === "aborted") return;
          patchUpload(localId, { status: "error", error: error.message });
        })
        .finally(() => uploadHandlesRef.current.delete(localId));
    },
    [config, patchUpload],
  );

  const addFiles = useCallback(
    (files: FileList) => {
      for (const file of Array.from(files)) {
        const localId = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
        setUploads((current) => [
          ...current,
          {
            localId,
            filename: file.name,
            size: file.size,
            progress: 0,
            status: "uploading",
            file,
          },
        ]);
        startUpload(localId, file);
      }
    },
    [startUpload],
  );

  const removeUpload = useCallback((localId: string) => {
    uploadHandlesRef.current.get(localId)?.abort();
    uploadHandlesRef.current.delete(localId);
    setUploads((current) => current.filter((u) => u.localId !== localId));
  }, []);

  const retryUpload = useCallback(
    (localId: string) => {
      const target = uploads.find((u) => u.localId === localId);
      if (target?.status === "error") startUpload(localId, target.file);
    },
    [startUpload, uploads],
  );

  const send = useCallback(
    async (content: string) => {
      const sess = sessionRef.current;
      if (!sess || sending) return;
      if (uploads.some((u) => u.status === "uploading")) return;
      const attachmentIds = uploads
        .filter((u) => u.status === "done" && u.attachmentId)
        .map((u) => u.attachmentId as string);
      // Text or files — either alone is a valid message.
      if (!content && attachmentIds.length === 0) return;
      const attachmentSummaries = uploads
        .filter((u) => u.status === "done")
        .map((u) => ({
          id: u.attachmentId,
          filename: u.filename,
          mimeType: u.file.type,
          size: u.size,
          url: null,
        }));
      setUploads([]);

      const local: WidgetMessage = {
        id: `local-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        conversationId: sess.conversation.id,
        senderType: "CONTACT",
        senderId: sess.contact.id,
        senderName: sess.contact.name,
        content,
        messageType: "TEXT",
        metadata:
          attachmentSummaries.length > 0
            ? { attachments: attachmentSummaries }
            : null,
        createdAt: new Date().toISOString(),
        pending: true,
      };
      setMessages((current) => [...current, local]);
      setSending(true);

      try {
        const message = await deliver(sess, content, attachmentIds);
        upsertMessage(message, local.id);
      } catch (error) {
        const text = error instanceof Error ? error.message : "";
        if (/resolved/i.test(text)) {
          // Agent closed the thread — start a fresh conversation and
          // deliver there (refreshSession replaces the visible history).
          try {
            const fresh = await refreshSession();
            const message = await deliver(fresh, content);
            upsertMessage(message);
          } catch {
            setMessages((current) => [
              ...current,
              { ...local, pending: false, failed: true },
            ]);
          }
        } else {
          setMessages((current) =>
            current.map((m) =>
              m.id === local.id ? { ...m, pending: false, failed: true } : m,
            ),
          );
        }
      } finally {
        setSending(false);
      }
    },
    [deliver, refreshSession, sending, uploads, upsertMessage],
  );

  const retryMessage = useCallback(
    (message: WidgetMessage) => {
      setMessages((current) => current.filter((m) => m.id !== message.id));
      void send(message.content);
    },
    [send],
  );

  const loadOlder = useCallback(async () => {
    const sess = sessionRef.current;
    if (!sess || !nextCursor || loadingOlder) return;
    setLoadingOlder(true);
    try {
      const page = await fetchMessages(config, sess.visitorToken, nextCursor);
      mergeMessages(page.data);
      setNextCursor(page.nextCursor);
    } catch {
      // Leave the cursor so the visitor can try again.
    } finally {
      setLoadingOlder(false);
    }
  }, [config, loadingOlder, mergeMessages, nextCursor]);

  const emitTyping = useCallback((eventName: string) => {
    const sess = sessionRef.current;
    const socket = socketRef.current;
    if (sess && socket?.connected) {
      socket.emit(eventName, { conversationId: sess.conversation.id });
    }
  }, []);

  const openPanel = useCallback(() => {
    setOpen(true);
    setUnread(0);
  }, []);

  const minimize = useCallback(() => setOpen(false), []);

  const close = useCallback(() => {
    setOpen(false);
    setDraft("");
    emitTyping(EVENTS.typingStop);
  }, [emitTyping]);

  return (
    <div className="helio-root">
      <Panel
        hidden={!open}
        status={status}
        workspaceName={session?.workspace.name ?? "Chat"}
        messages={messages}
        typingNames={Object.values(typingAgents)}
        nextCursor={nextCursor}
        loadingOlder={loadingOlder}
        draft={draft}
        sending={sending}
        uploads={uploads}
        onAddFiles={addFiles}
        onRemoveUpload={removeUpload}
        onRetryUpload={retryUpload}
        session={session}
        config={config}
        onDraftChange={setDraft}
        onSend={(content) => void send(content)}
        onRetryBoot={() => void boot()}
        onRetryMessage={retryMessage}
        onLoadOlder={() => void loadOlder()}
        onTypingStart={() => emitTyping(EVENTS.typingStart)}
        onTypingStop={() => emitTyping(EVENTS.typingStop)}
        onMinimize={minimize}
        onClose={close}
      />

      <button
        type="button"
        className="helio-launcher"
        aria-label={open ? "Minimize chat" : "Open chat"}
        onClick={open ? minimize : openPanel}
      >
        {open ? (
          <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <path
              d="M6 9l6 6 6-6"
              stroke="currentColor"
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        ) : (
          <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <path
              d="M4 5.5A2.5 2.5 0 0 1 6.5 3h11A2.5 2.5 0 0 1 20 5.5v8a2.5 2.5 0 0 1-2.5 2.5H9l-4.2 3.36A.5.5 0 0 1 4 18.97V5.5Z"
              fill="currentColor"
            />
          </svg>
        )}
        {!open && unread > 0 && (
          <span
            className="helio-unread"
            aria-label={`${unread} unread messages`}
          >
            {unread > 9 ? "9+" : unread}
          </span>
        )}
      </button>
    </div>
  );
}
