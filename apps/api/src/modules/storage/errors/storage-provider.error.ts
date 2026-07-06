export type StorageFailureReason =
  | 'timeout'
  | 'unavailable'
  | 'not_found'
  | 'permission';

/**
 * The only failure type providers may throw — same pattern as
 * AiProviderError / EmailProviderError. StorageService maps it onto HTTP
 * responses; nothing above the provider ever sees an AWS error shape.
 */
export class StorageProviderError extends Error {
  constructor(
    readonly reason: StorageFailureReason,
    message: string,
  ) {
    super(message);
    this.name = 'StorageProviderError';
  }
}
