# Reviewer Testing Guide

Everything below is on the live deployment and takes about ten minutes total. No setup needed — just a browser (two tabs) and optionally your own email account.

## 0. Confirm it's alive (30 seconds)

Open https://api.dineshbhadane.com/health — you should see `"status":"ok"` with every component `up`.

## 1. Signup and workspace (1 minute)

Go to https://helio.dineshbhadane.com/signup and create an account (any email-shaped address works; there's no email verification). You land in the inbox of your own freshly created workspace. Copy your **workspace ID** — you'll need it for the widget: it's in the dashboard under Settings.

## 2. Live chat, both sides (3 minutes)

1. Keep the dashboard inbox open in tab 1.
2. In tab 2, open https://demo.dineshbhadane.com — a fake storefront with Helio embedded. Paste your workspace ID into the input and click **Load widget**.
3. Click the chat bubble (bottom-right), send a message like _"my order arrived damaged"_.
4. Watch tab 1: the conversation appears in the inbox **without refreshing**.
5. Open it, type a reply, hit Enter — it appears inside the widget in tab 2 instantly. Typing indicators work in both directions.
6. Attach a file from the widget (paperclip) — it lands in the conversation; download it from the dashboard side.

## 3. AI assistant (2 minutes)

With the conversation open in the dashboard, click the **AI** button (top right of the thread):

- **Generate summary** — a real Gemini summary of the thread appears (cached; regenerating without new messages is instant).
- **Generate reply** — a suggested reply you can insert into the composer, optionally guided by instructions ("offer a refund").
- **Rewrite Draft** — type something rough in the composer, then Professional / Friendly / Shorter.
- **Find relevant articles** — suggests published KB articles (do step 4 first to have some).

## 4. Knowledge base and public help center (1 minute)

Dashboard → Knowledge Base → create a category and an article, mark it **published**. Then open `https://helio.dineshbhadane.com/help?workspace=<your-workspace-id>` in a private window — the article is there, publicly, with working full-text search. Unpublished drafts don't appear.

## 5. Email channel (1 minute, optional but worth it)

Dashboard → Settings → register an email account. The address `support@dineshbhadane.com` is wired to Cloudflare Email Routing for the workspace that owns it — if you're testing with a provided reviewer account that owns it, send a real email there from your own mailbox and watch it appear as an EMAIL conversation in the inbox (usually under 10 seconds). Reply from the dashboard — it arrives back in your mail client, correctly threaded. Replies in your mail client thread back into the same conversation.

## 6. Automation (1 minute)

Dashboard → Automation → New rule: trigger **Message received**, condition **message contains** `refund`, action **add tag** + **set priority HIGH**. Send _"I want a refund"_ from the widget → within a couple of seconds the conversation is tagged and high-priority, and the rule's run shows under Automation history.

## 7. Audit, timeline, health (30 seconds)

- **Audit Logs** page: every action you just took (resolve, assign, rule created, uploads) with actor and timestamp.
- Open any conversation → its timeline interleaves messages with those events.
- **System Health** page (or `/health` on the API): live component status.

## 8. Tenant isolation (1 minute, the important one)

Open a private window, sign up as a _second_ account with a new workspace, and look around: empty inbox, no contacts, no articles — none of your first workspace's data exists here. Paste the second workspace's ID into the widget demo and verify the chat lands only in the second inbox.

## Resolve behavior worth noticing

Resolve the chat conversation in the dashboard, then send another message from the same widget — it starts a **new** conversation rather than reopening the closed one. Same rule applies to emails on resolved threads.

## If you'd rather run it locally

```bash
git clone https://github.com/Dinesh3098/helio.git && cd helio
cp .env.production.example .env   # set JWT_SECRET (any 32+ chars)
docker compose up --build         # dashboard :3000, api :4000
```

And the full automated suite: `pnpm install && pnpm test` (400 tests; integration tests start their own Postgres/Redis containers). Screenshots of every flow above are in [docs/screenshots](screenshots/).
