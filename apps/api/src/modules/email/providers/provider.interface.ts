/**
 * Outbound-email abstraction. Providers only know how to deliver one
 * message — threading, persistence, and routing live in EmailService.
 * Adding SMTP/SES/SendGrid means one new class and one binding.
 */
export const EMAIL_PROVIDER = Symbol("EMAIL_PROVIDER");

export interface OutboundEmail {
  from: string;
  fromName?: string;
  to: string;
  subject: string;
  text: string;
  /** RFC 5322 threading headers, set by EmailService. */
  headers: {
    "Message-ID": string;
    "In-Reply-To"?: string;
    References?: string;
  };
}

export interface EmailProvider {
  readonly name: string;
  send(email: OutboundEmail): Promise<void>;
}

export type EmailFailureReason = "timeout" | "unavailable" | "rejected";

export class EmailProviderError extends Error {
  constructor(
    readonly reason: EmailFailureReason,
    message: string,
    /** Rejections (bad address, unverified domain) are not retryable. */
    readonly retryable = reason !== "rejected",
  ) {
    super(message);
    this.name = "EmailProviderError";
  }
}
