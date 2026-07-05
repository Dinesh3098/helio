/**
 * Text-generation abstraction. The rest of the AI module depends on this
 * token, never on a vendor SDK/API — swapping Gemini for another provider
 * means adding one class and changing one binding in ai.module.ts.
 */
export const AI_PROVIDER = Symbol('AI_PROVIDER');

export interface AiGenerateRequest {
  prompt: string;
  /** Ask the model for a strict-JSON response body. */
  json?: boolean;
  temperature?: number;
}

export interface AiProvider {
  /** Model identifier persisted alongside stored outputs. */
  readonly model: string;
  generate(request: AiGenerateRequest): Promise<string>;
}

export type AiFailureReason =
  | 'timeout'
  | 'unavailable'
  | 'quota'
  | 'malformed';

/** Single failure type the service maps onto HTTP responses. */
export class AiProviderError extends Error {
  constructor(
    readonly reason: AiFailureReason,
    message: string,
  ) {
    super(message);
    this.name = 'AiProviderError';
  }
}
