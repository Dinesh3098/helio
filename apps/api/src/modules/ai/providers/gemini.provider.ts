import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AppConfig } from '../../../config/configuration';
import {
  AiGenerateRequest,
  AiProvider,
  AiProviderError,
} from './ai-provider.interface';

// 2.0-flash has zero free-tier quota on this key; 2.5-flash is covered.
const GEMINI_MODEL = 'gemini-2.5-flash';
const BASE_URL = 'https://generativelanguage.googleapis.com/v1beta/models';
const REQUEST_TIMEOUT_MS = 25_000;

interface GeminiResponse {
  candidates?: {
    content?: { parts?: { text?: string }[] };
    finishReason?: string;
  }[];
}

/**
 * Gemini over its REST API with native fetch — no SDK dependency to leak.
 * Everything vendor-specific (wire format, error codes, safety blocks)
 * ends here; callers only ever see AiProviderError.
 */
@Injectable()
export class GeminiProvider implements AiProvider {
  readonly model = GEMINI_MODEL;

  private readonly logger = new Logger(GeminiProvider.name);
  private readonly apiKey: string;

  constructor(config: ConfigService<AppConfig, true>) {
    this.apiKey = config.get('gemini.apiKey', { infer: true });
  }

  async generate(request: AiGenerateRequest): Promise<string> {
    if (!this.apiKey) {
      throw new AiProviderError('unavailable', 'AI is not configured');
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

    let response: Response;
    try {
      response = await fetch(
        `${BASE_URL}/${this.model}:generateContent?key=${this.apiKey}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          signal: controller.signal,
          body: JSON.stringify({
            contents: [{ parts: [{ text: request.prompt }] }],
            generationConfig: {
              temperature: request.temperature ?? 0.4,
              ...(request.json
                ? { responseMimeType: 'application/json' }
                : {}),
            },
          }),
        },
      );
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') {
        throw new AiProviderError('timeout', 'The AI request timed out');
      }
      throw new AiProviderError(
        'unavailable',
        'Could not reach the AI service',
      );
    } finally {
      clearTimeout(timer);
    }

    if (response.status === 429) {
      throw new AiProviderError('quota', 'AI quota exceeded — try again soon');
    }
    if (!response.ok) {
      this.logger.warn(`Gemini responded ${response.status}`);
      throw new AiProviderError(
        'unavailable',
        'The AI service is currently unavailable',
      );
    }

    const body = (await response.json().catch(() => null)) as
      | GeminiResponse
      | null;
    const text = body?.candidates?.[0]?.content?.parts
      ?.map((part) => part.text ?? '')
      .join('')
      .trim();

    if (!text) {
      this.logger.warn(
        `Gemini returned no text (finishReason: ${body?.candidates?.[0]?.finishReason ?? 'unknown'})`,
      );
      throw new AiProviderError(
        'malformed',
        'The AI returned an unexpected response',
      );
    }
    return text;
  }
}
