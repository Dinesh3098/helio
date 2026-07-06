import type { Socket } from "socket.io";

/**
 * Sliding-window throttle keyed per socket per event. State lives in a
 * WeakMap so it disappears with the socket — nothing to clean up on
 * disconnect and nothing shared across instances (each instance protects
 * itself, which is exactly the point of connection-level throttling).
 */
export class SocketRateLimiter {
  private readonly windows = new WeakMap<Socket, Map<string, number[]>>();

  allow(
    socket: Socket,
    event: string,
    maxEvents: number,
    windowMs: number,
  ): boolean {
    const byEvent = this.windows.get(socket) ?? new Map<string, number[]>();
    this.windows.set(socket, byEvent);

    const now = Date.now();
    const recent = (byEvent.get(event) ?? []).filter(
      (ts) => now - ts < windowMs,
    );
    if (recent.length >= maxEvents) {
      byEvent.set(event, recent);
      return false;
    }
    recent.push(now);
    byEvent.set(event, recent);
    return true;
  }
}
