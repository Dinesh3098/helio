# @helio/chat-widget

Embeddable customer chat widget for Helio — the Intercom-style launcher
customers see on a website. It is a standalone package: no Next.js, no
dashboard code, just Preact + socket.io-client compiled to two plain
scripts.

## Embedding

```html
<script src="https://your-cdn.example.com/widget.js"></script>
<script>
  window.Helio.init({
    workspaceId: "YOUR-WORKSPACE-UUID", // dashboard → Settings → Workspace ID
    apiUrl: "https://api.your-helio.example.com",
    socketUrl: "https://api.your-helio.example.com", // optional, defaults to apiUrl
  });
</script>
```

### Initialization options

| Option        | Required | Description                                  |
| ------------- | -------- | -------------------------------------------- |
| `workspaceId` | yes      | Workspace the widget belongs to (uuid).       |
| `apiUrl`      | yes      | Helio API origin.                             |
| `socketUrl`   | no       | Socket.IO origin; defaults to `apiUrl`.       |

`init()` is idempotent — calling it twice logs a warning and does nothing.

## Bundle layout (performance)

- **`widget.js` (~1.3 KB gzip)** — the loader. Vanilla TS, zero
  dependencies. Renders the floating launcher inside a shadow root.
  This is all a customer page pays on load.
- **`widget-app.js` (~24 KB gzip)** — Preact app + socket.io-client.
  Injected by the loader only when the visitor first opens the chat.
  Styles live inside the shadow root, so host-page CSS and widget CSS
  can't interfere with each other.

Build both with:

```sh
pnpm --filter @helio/chat-widget build
```

The build also copies the bundles into `apps/web/public/` so the
dashboard's `/demo` page can embed them during review.

## Visitor identity

Customers never log in. On first visit the widget mints a UUID and stores
it as `helio:visitor:<workspaceId>` in localStorage; every later visit
reuses it, so refreshes never create new visitors. If storage is
unavailable (locked-down private browsing), a per-page in-memory id is
used as a fallback.

## Sessions, contacts, and conversations

Opening the widget calls `POST /widget/session` with
`{ workspaceId, visitorId }`. The backend:

1. validates the workspace exists;
2. finds the contact with that `visitorId` in that workspace, or creates
   one (a unique index makes concurrent tabs converge on one contact);
3. finds the contact's latest OPEN/SNOOZED chat conversation, or creates
   a fresh one — so a conversation an agent resolved stays resolved, and
   the next message starts a new thread;
4. returns a **visitor token**: a short-lived JWT pinning
   `{ contactId, workspaceId, conversationId }`.

Everything after that uses the token. The widget never sends conversation
ids of its own choosing — the server only honours the one inside the
token, which is what prevents one visitor from reading another's thread.

Message history comes from `GET /widget/messages` (keyset-paginated,
oldest→newest), so the full conversation survives page refreshes.

## Realtime

The widget is a plain client of the existing Socket.IO gateway — same
events as the dashboard, no separate protocol:

- handshake: `io(socketUrl, { auth: { visitorToken } })`
- `joinConversation` / `leaveConversation`
- `sendMessage` (with acknowledgement; REST fallback when disconnected)
- `typingStart` / `typingStop`
- inbound: `messageCreated`, `typingStarted`, `typingStopped`,
  `messageError`

Messages are persisted by the same `MessagesService` the dashboard uses;
agents see visitor messages in the inbox instantly and vice versa.

On reconnect the widget re-joins its room and re-fetches the latest page,
merging by message id, so drops never lose or duplicate messages. If an
agent resolves the conversation mid-chat, the next send transparently
bootstraps a new session/conversation and delivers there.

## Demo

Run the API and dashboard, build this package, then open
`http://localhost:3000/demo`, paste a workspace id (dashboard →
Settings), and load the widget. Answer from the inbox in another tab to
see both directions live.
