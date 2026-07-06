# Final Submission Checklist

## Links

- ✅ **Dashboard URL**: https://helio.dineshbhadane.com
- ✅ **Widget Demo URL**: https://demo.dineshbhadane.com
- ✅ **API URL**: https://api.dineshbhadane.com — health: https://api.dineshbhadane.com/health
- ✅ **GitHub Repository**: https://github.com/Dinesh3098/helio
- ✅ **Test email (inbound channel)**: send to `support@dineshbhadane.com` → appears in the inbox of the workspace that registered the mailbox

> Reviewer credentials: create a fresh account at https://helio.dineshbhadane.com/signup (signup provisions a workspace instantly), or use a dedicated reviewer account if one was shared separately. For the widget demo, paste your workspace ID (dashboard → Settings) into the input on the demo page, or open `https://demo.dineshbhadane.com/?workspace=<id>`.

## Required environment variables

Hard-required (API refuses to boot): `DATABASE_URL`, `REDIS_URL`, `JWT_SECRET` (≥32 chars).
Optional — feature disables gracefully when missing: `GEMINI_API_KEY` (AI), `RESEND_API_KEY` (outbound email), `AWS_REGION`/`AWS_S3_BUCKET`/`AWS_ACCESS_KEY_ID`/`AWS_SECRET_ACCESS_KEY` (S3; `STORAGE_PROVIDER=local` needs none).
Frontend build-time: `NEXT_PUBLIC_API_URL`, `NEXT_PUBLIC_DEMO_WORKSPACE_ID` (optional).
Full reference with comments: [.env.example](../.env.example) · compose variant: [.env.production.example](../.env.production.example).

## Commands to verify production

```bash
curl -s https://api.dineshbhadane.com/health | jq .          # expect "status":"ok"
curl -s -o /dev/null -w "%{http_code}\n" https://helio.dineshbhadane.com/login    # 200
curl -s -o /dev/null -w "%{http_code}\n" https://demo.dineshbhadane.com/widget.js # 200
curl -s "https://api.dineshbhadane.com/socket.io/?EIO=4&transport=polling" | head -c 60  # 0{"sid":...
```

Local verification from a clean clone:

```bash
pnpm install && pnpm lint && pnpm check-types && pnpm build && pnpm test   # 400 tests
cp .env.production.example .env   # set JWT_SECRET
docker compose up --build         # full stack on :3000/:4000
```

## Manual smoke test (10 minutes)

- [ ] Sign up at `/signup` → lands in inbox, workspace created
- [ ] Log out, log back in
- [ ] Team page: invite a second account (create it via signup first), change its role, verify an AGENT cannot invite
- [ ] Open `demo.dineshbhadane.com`, paste workspace ID → widget bubble appears
- [ ] Send a message from the widget → appears in the dashboard inbox **without refresh**
- [ ] Reply as agent → appears in the widget instantly; typing indicators both ways
- [ ] Attach a file in the widget → agent can download it
- [ ] AI panel: generate summary, suggested reply, rewrite draft (needs `GEMINI_API_KEY`)
- [ ] Knowledge base: create category + article, publish → visible at `/help` and in public search
- [ ] Email: send mail to the registered mailbox → EMAIL conversation appears; reply from the dashboard → arrives in your mail client threaded (needs `RESEND_API_KEY`)
- [ ] Automation: rule `MESSAGE_RECEIVED` + `messageContains` → new matching widget message gets tagged; check `/automation` history
- [ ] Audit page shows the actions above with actors; conversation timeline interleaves events
- [ ] Resolve the conversation → widget starts a fresh session on next message
- [ ] Create a second workspace member account in another workspace → verify it sees none of the first workspace's data
- [ ] `GET /health` shows all components `up`

## Repo hygiene

- ✅ No secrets committed (`.env*` gitignored; only `*.example` tracked; CI uses mock values)
- ✅ CI green on the submitted commit (lint, types, 400 tests, Docker boot, E2E probes)
- ✅ Docs: README, architecture, API, realtime, scaling, testing, ci-cd, deployment, runbook
- ✅ `docker compose up --build` works from a clean clone
