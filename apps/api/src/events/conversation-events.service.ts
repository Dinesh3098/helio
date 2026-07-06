import { Injectable, Logger } from '@nestjs/common';
import { AsyncLocalStorage } from 'node:async_hooks';
import { AutomationTrigger } from '../database/entities';
import type { MessageResponseDto } from '../modules/messages/dto/message-response.dto';

export interface ConversationEvent {
  trigger: AutomationTrigger;
  workspaceId: string;
  conversationId: string;
  /** Present on MESSAGE_RECEIVED / MESSAGE_SENT. */
  message?: MessageResponseDto;
}

type EventHandler = (event: ConversationEvent) => Promise<void>;

/**
 * In-process event bus feeding the automation engine. Dependency-free
 * (same pattern as RealtimeEmitter): business modules emit, the engine
 * registers the single handler at startup — no module cycles.
 *
 * Loop safety: the executor runs all rule actions inside runSuppressed().
 * AsyncLocalStorage carries that flag through every await, so any event a
 * service emits *because of an automation action* (auto-reply message,
 * status change, …) is dropped at emit() — recursion is structurally
 * impossible, not merely discouraged.
 *
 * Delivery is deferred (setImmediate) and errors are swallowed after
 * logging: automation must never fail or slow down the request that
 * triggered it.
 */
@Injectable()
export class ConversationEventsService {
  private readonly logger = new Logger(ConversationEventsService.name);
  private readonly suppression = new AsyncLocalStorage<boolean>();
  private handler: EventHandler | null = null;

  setHandler(handler: EventHandler): void {
    this.handler = handler;
  }

  emit(event: ConversationEvent): void {
    if (this.suppression.getStore()) return;
    const handler = this.handler;
    if (!handler) return;
    setImmediate(() => {
      handler(event).catch((error: unknown) => {
        this.logger.error(
          `automation handler failed for ${event.trigger} on conversation ${event.conversationId}: ${
            error instanceof Error ? error.message : 'unknown error'
          }`,
        );
      });
    });
  }

  /** Everything (a)synchronously inside `fn` emits into the void. */
  runSuppressed<T>(fn: () => Promise<T>): Promise<T> {
    return this.suppression.run(true, fn);
  }
}
