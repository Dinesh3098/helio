import { Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { AppConfig } from "../../../config/configuration";
import {
  EmailProvider,
  EmailProviderError,
  OutboundEmail,
} from "./provider.interface";

const RESEND_URL = "https://api.resend.com/emails";
const REQUEST_TIMEOUT_MS = 15_000;

/**
 * Resend over its REST API — same no-SDK pattern as the Gemini provider.
 * All wire-format and vendor-error knowledge ends at this class.
 */
@Injectable()
export class ResendProvider implements EmailProvider {
  readonly name = "RESEND";

  private readonly logger = new Logger(ResendProvider.name);
  private readonly apiKey: string;

  constructor(config: ConfigService<AppConfig, true>) {
    this.apiKey = config.get("resend.apiKey", { infer: true });
  }

  async send(email: OutboundEmail): Promise<void> {
    if (!this.apiKey) {
      throw new EmailProviderError(
        "unavailable",
        "Email sending is not configured",
      );
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

    let response: Response;
    try {
      response = await fetch(RESEND_URL, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          "Content-Type": "application/json",
        },
        signal: controller.signal,
        body: JSON.stringify({
          from: email.fromName
            ? `${email.fromName} <${email.from}>`
            : email.from,
          to: [email.to],
          subject: email.subject,
          text: email.text,
          headers: email.headers,
        }),
      });
    } catch (error) {
      if (error instanceof Error && error.name === "AbortError") {
        throw new EmailProviderError("timeout", "Email provider timed out");
      }
      throw new EmailProviderError(
        "unavailable",
        "Could not reach the email provider",
      );
    } finally {
      clearTimeout(timer);
    }

    if (response.ok) return;

    const body = (await response.json().catch(() => null)) as {
      message?: string;
    } | null;
    this.logger.warn(
      `Resend responded ${response.status}: ${body?.message ?? "no detail"}`,
    );

    // 4xx = our request was rejected (bad sender, unverified domain) —
    // retrying the same payload cannot succeed. 5xx/429 are transient.
    if (
      response.status >= 400 &&
      response.status < 500 &&
      response.status !== 429
    ) {
      throw new EmailProviderError(
        "rejected",
        body?.message ?? "The email provider rejected this message",
      );
    }
    throw new EmailProviderError(
      "unavailable",
      "The email provider is currently unavailable",
    );
  }
}
