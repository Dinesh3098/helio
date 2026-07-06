import { Injectable } from '@nestjs/common';
import { AsyncLocalStorage } from 'node:async_hooks';

/**
 * Per-request correlation data, carried through every await by
 * AsyncLocalStorage. The middleware seeds requestId/ip/userAgent before
 * routing; the enrichment interceptor adds userId/workspaceId after the
 * guards resolve them. Consumers (AuditService, logs) read it without any
 * signature threading — and code running outside HTTP (automation engine,
 * socket handlers, webhooks) simply sees an empty store, which downstream
 * is interpreted as "system".
 */
export interface RequestContext {
  requestId: string;
  ipAddress: string | null;
  userAgent: string | null;
  userId?: string;
  workspaceId?: string;
}

@Injectable()
export class RequestContextService {
  private readonly storage = new AsyncLocalStorage<RequestContext>();

  run<T>(context: RequestContext, fn: () => T): T {
    return this.storage.run(context, fn);
  }

  get(): RequestContext | undefined {
    return this.storage.getStore();
  }

  /** Mutates the active store — used once guards know who is calling. */
  assign(patch: Partial<RequestContext>): void {
    const store = this.storage.getStore();
    if (store) Object.assign(store, patch);
  }
}
