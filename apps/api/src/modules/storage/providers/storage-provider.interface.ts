import type { Readable } from "node:stream";

/**
 * Object-storage abstraction. Providers move bytes for a key — nothing
 * else. Validation, Attachment rows, audit, and metrics live above in
 * StorageService/AttachmentsService. Same injection pattern as
 * AI_PROVIDER and EMAIL_PROVIDER: swapping vendors is one binding.
 */
export const STORAGE_PROVIDER = Symbol("STORAGE_PROVIDER");

export interface PutObjectInput {
  key: string;
  /** Streamed to the backend — providers must never buffer whole files. */
  body: Readable;
  contentType: string;
  contentLength: number;
}

/**
 * How a client should download the object: a URL to redirect to
 * (S3 pre-signed) or a stream to proxy (local disk).
 */
export type ObjectDownload =
  | { kind: "url"; url: string }
  | { kind: "stream"; stream: Readable };

export interface StorageProvider {
  readonly name: string;
  put(input: PutObjectInput): Promise<void>;
  getDownload(key: string, downloadFilename: string): Promise<ObjectDownload>;
  delete(key: string): Promise<void>;
  /**
   * Resolves when the backend can accept uploads; throws
   * StorageProviderError otherwise. Consumed by the health endpoint —
   * a failing backend degrades uploads without taking the app down.
   */
  checkAvailability(): Promise<void>;
}
