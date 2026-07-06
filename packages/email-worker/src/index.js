import PostalMime from "postal-mime";

/**
 * Adapter between Cloudflare Email Routing and Helio's inbound webhook.
 * Parses the raw RFC 5322 message and forwards the fields
 * `POST /email/webhook` expects (InboundEmailDto). All business logic —
 * contact creation, threading, workspace routing — stays in the API.
 */
export default {
  async email(message, env) {
    const parsed = await PostalMime.parse(message.raw);

    const payload = {
      from: message.from,
      fromName: parsed.from?.name || undefined,
      to: message.to,
      subject: parsed.subject || undefined,
      // A real MTA always sets Message-ID, but the webhook requires it.
      messageId:
        parsed.messageId || `<${crypto.randomUUID()}@email-worker.helio>`,
      inReplyTo: parsed.inReplyTo || undefined,
      references: parsed.references || undefined,
      text:
        parsed.text?.trim() ||
        parsed.html?.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim() ||
        "(empty message)",
      html: parsed.html || undefined,
      // Metadata only — Helio never stores attachment bytes.
      attachments: (parsed.attachments || []).map((attachment) => ({
        filename: attachment.filename || "attachment",
        mimeType: attachment.mimeType || "application/octet-stream",
        size: attachment.content?.byteLength ?? 0,
      })),
    };

    const response = await fetch(`${env.WEBHOOK_URL}/email/webhook`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      // Visible in `wrangler tail` and the Cloudflare dashboard logs.
      console.log(
        `helio webhook rejected ${message.from} -> ${message.to}:`,
        response.status,
        await response.text().catch(() => ""),
      );
    }
  },
};
