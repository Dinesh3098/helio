import type { Socket } from "socket.io";
import { SocketRateLimiter } from "./socket-rate-limiter";

describe("SocketRateLimiter", () => {
  let limiter: SocketRateLimiter;

  const makeSocket = (): Socket => ({ id: "socket" }) as unknown as Socket;

  beforeEach(() => {
    jest.useFakeTimers({ now: new Date("2026-07-06T10:00:00Z") });
    limiter = new SocketRateLimiter();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it("allows events under the limit", () => {
    const socket = makeSocket();
    expect(limiter.allow(socket, "sendMessage", 3, 1000)).toBe(true);
    expect(limiter.allow(socket, "sendMessage", 3, 1000)).toBe(true);
    expect(limiter.allow(socket, "sendMessage", 3, 1000)).toBe(true);
  });

  it("blocks the event that exceeds the limit within the window", () => {
    const socket = makeSocket();
    for (let i = 0; i < 3; i += 1) {
      expect(limiter.allow(socket, "sendMessage", 3, 1000)).toBe(true);
    }
    expect(limiter.allow(socket, "sendMessage", 3, 1000)).toBe(false);
  });

  it("does not count blocked attempts toward the window", () => {
    const socket = makeSocket();
    limiter.allow(socket, "sendMessage", 1, 1000); // consumes the slot
    limiter.allow(socket, "sendMessage", 1, 1000); // blocked, must not extend
    jest.advanceTimersByTime(1001);
    expect(limiter.allow(socket, "sendMessage", 1, 1000)).toBe(true);
  });

  it("allows again once the window slides past old events", () => {
    const socket = makeSocket();
    expect(limiter.allow(socket, "typingStart", 2, 1000)).toBe(true);
    jest.advanceTimersByTime(600);
    expect(limiter.allow(socket, "typingStart", 2, 1000)).toBe(true);
    // Both slots used; still inside both windows.
    expect(limiter.allow(socket, "typingStart", 2, 1000)).toBe(false);

    // 1001ms after the first event: it slides out, freeing one slot.
    jest.advanceTimersByTime(401);
    expect(limiter.allow(socket, "typingStart", 2, 1000)).toBe(true);
    // The second event (600ms ago) plus this one refill the window.
    expect(limiter.allow(socket, "typingStart", 2, 1000)).toBe(false);
  });

  it("tracks each event name independently on the same socket", () => {
    const socket = makeSocket();
    expect(limiter.allow(socket, "sendMessage", 1, 1000)).toBe(true);
    expect(limiter.allow(socket, "sendMessage", 1, 1000)).toBe(false);
    expect(limiter.allow(socket, "typingStart", 1, 1000)).toBe(true);
  });

  it("tracks each socket independently for the same event", () => {
    const socketA = makeSocket();
    const socketB = makeSocket();
    expect(limiter.allow(socketA, "sendMessage", 1, 1000)).toBe(true);
    expect(limiter.allow(socketA, "sendMessage", 1, 1000)).toBe(false);
    expect(limiter.allow(socketB, "sendMessage", 1, 1000)).toBe(true);
  });

  it("blocks everything when maxEvents is zero", () => {
    const socket = makeSocket();
    expect(limiter.allow(socket, "sendMessage", 0, 1000)).toBe(false);
  });
});
