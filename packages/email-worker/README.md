# @helio/email-worker

Cloudflare Email Worker that turns real inbound email into Helio
conversations. It is the transport adapter for `POST /email/webhook`:

```
customer's mail app → MX (Cloudflare Email Routing) → this worker
  → POST {apiOrigin}/email/webhook → contact + conversation + message
```

The `to` address must be connected as an EmailAccount in a workspace —
that lookup (in the API, not here) decides which workspace's inbox the
conversation lands in. One deployed worker serves every workspace.

## Deploy

1. Set `WEBHOOK_URL` in `wrangler.toml` to the API's public origin
   (local dev: a `cloudflared tunnel --url http://localhost:4000` URL).
2. `npx wrangler login` (once), then `pnpm deploy` in this package.
3. Cloudflare dashboard → the domain → Email → Email Routing →
   Routing rules → create the address (e.g. `support@…`) with action
   **Send to a Worker** → `helio-email-worker`.

Debug incoming mail live with `pnpm tail`.
