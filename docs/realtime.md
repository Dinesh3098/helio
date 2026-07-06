# Realtime Protocol (Socket.IO)

Phase 9. The REST API remains the source of truth; Socket.IO is an
additional transport. The gateway (`apps/api/src/realtime/`) contains no
business logic — it authenticates, authorizes room access, delegates to
the existing services, and broadcasts.

```
Client ──▶ RealtimeGateway ──▶ MessagesService ──▶ PostgreSQL
                 │
                 └──▶ broadcast to conversation room
```

## Connection

- Endpoint: same origin/port as the REST API (default `http://localhost:4000`).
- Handshake auth: `io(url, { auth: { token: <JWT access token> } })`.
- The token is verified with the same rules as HTTP requests (signature,
  expiry, user exists and is active). Invalid or missing tokens receive a
  `messageError` and are disconnected immediately.
- On disconnect, Socket.IO removes the socket from all rooms; the in-memory
  connection registry (online-status groundwork, no UI yet) is updated.
- Reconnecting clients must re-join their rooms (the dashboard does this on
  every `connect` event).

## Rooms

One room per conversation: `conversation:<conversationId>`.

Joining requires the caller to be a member of the workspace that owns the
conversation (checked against the database on every join and send — the
gateway holds no authorization state). Unauthorized joins receive
`messageError`.

## Events

### Client → Server

| Event                  | Payload                       | Notes                                                                                                                                        |
| ---------------------- | ----------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| `joinWorkspace`        | `{ workspaceId }`             | Agents only; membership-checked; leaves other workspace rooms; ≤ 20 / 10 s                                                                   |
| `joinConversation`     | `{ conversationId }`          | Tenancy-checked; ≤ 20 / 10 s                                                                                                                 |
| `leaveConversation`    | `{ conversationId }`          |                                                                                                                                              |
| `sendMessage`          | `{ conversationId, content }` | Same validation as REST (non-empty, ≤ 10 000 chars); ≤ 10 / 10 s. Supports acknowledgement: `{ message }` on success, `{ error }` on failure |
| `typingStart`          | `{ conversationId }`          | Requires prior join; transient; excess events dropped (≤ 15 / 5 s)                                                                           |
| `typingStop`           | `{ conversationId }`          | Same as `typingStart`                                                                                                                        |
| `markConversationRead` | `{ conversationId }`          | Reserved for the read-receipts milestone; accepted, no-op                                                                                    |

### Server → Client

| Event                 | Payload                                  | Notes                                                                                               |
| --------------------- | ---------------------------------------- | --------------------------------------------------------------------------------------------------- |
| `workspaceJoined`     | `{ workspaceId }`                        | Ack to the joining socket                                                                           |
| `conversationJoined`  | `{ conversationId }`                     | Ack to the joining socket                                                                           |
| `conversationLeft`    | `{ conversationId }`                     | Ack to the leaving socket                                                                           |
| `messageCreated`      | `MessageResponseDto`                     | To the conversation room **and** the workspace room (single deduped emit), **including the sender** |
| `conversationUpdated` | `ConversationResponseDto & { assignee }` | To every socket in the room when status/priority/assignee changes                                   |
| `typingStarted`       | `{ conversationId, userId, name }`       | To the room **except** the sender                                                                   |
| `typingStopped`       | `{ conversationId, userId, name }`       | To the room **except** the sender                                                                   |
| `messageError`        | `{ message, event?, conversationId? }`   | To the offending socket only                                                                        |

## Send-message flow

1. Gateway validates the payload (shared `CreateMessageDto` rules).
2. Rate limit check (per-socket sliding window).
3. Tenancy check: conversation → workspace → caller's membership.
4. `MessagesService.createAgentMessage(...)` — the same code path as REST:
   resolved conversations are rejected (business rule), the message insert
   and the conversation's denormalized fields commit in one transaction,
   snoozed conversations reopen.
5. `messageCreated` is broadcast to the room; the ack returns the message
   to the sender.

Messages sent through REST are **not** broadcast (the dashboard always
sends through the socket when connected, and falls back to REST only when
offline). When the chat widget lands, it sends through this same gateway,
so both sides receive broadcasts.

## Error handling

`messageError` is emitted for: unauthorized connection, unknown
conversation, workspace mismatch, payload validation failures, resolved
conversations, and rate-limit violations. Service exceptions
(404/403/409) pass their messages through; everything else is generic.

## Scaling

The gateway is stateless: authorization hits the database, rooms are
Socket.IO server state, rate-limit windows are per-socket (die with the
socket), and the connection registry is explicitly instance-local
groundwork.

To run multiple API instances, add `@socket.io/redis-adapter` in a custom
`IoAdapter` (registered in `main.ts`) using the existing Upstash Redis
connection. Room broadcasts then fan out across instances via Redis
pub/sub; no gateway code changes. At the same time, presence moves from
the in-memory registry to Redis keys.

## Frontend integration

- `apps/web/lib/realtime/socket.ts` — lazy singleton; the auth callback
  re-reads the token store on every (re)connect attempt.
- Connected once per session by the dashboard layout; disconnected on
  logout.
- `useConversationRoom(id)` joins/leaves the room with the open
  conversation, re-joins after reconnects, and folds `messageCreated`
  into the React Query caches with `setQueryData` (append to the thread,
  bump list previews/status in place — no refetching). Messages for other
  conversations update previews and a client-side unread badge only.
- Sending goes through `sendMessage` with an acknowledgement; the existing
  optimistic-UI flow is unchanged (append placeholder → replace on ack,
  dedupe against the room broadcast by message id).
