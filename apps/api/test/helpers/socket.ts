import { io, Socket } from "socket.io-client";

/**
 * Socket.IO client helpers. Auth mirrors the gateway contract:
 * agents pass `auth.token` (JWT access token), widget visitors pass
 * `auth.visitorToken`.
 */

export function connectSocket(
  baseUrl: string,
  auth: { token?: string; visitorToken?: string },
  timeoutMs = 5000,
): Promise<Socket> {
  return new Promise((resolve, reject) => {
    const socket = io(baseUrl, {
      auth,
      transports: ["websocket"],
      reconnection: false,
      timeout: timeoutMs,
    });
    const timer = setTimeout(() => {
      socket.disconnect();
      reject(new Error(`socket connect timed out after ${timeoutMs}ms`));
    }, timeoutMs);
    socket.on("connect", () => {
      clearTimeout(timer);
      resolve(socket);
    });
    socket.on("connect_error", (error) => {
      clearTimeout(timer);
      socket.disconnect();
      reject(error);
    });
  });
}

/** Resolves with the next `event` payload, or rejects on timeout. */
export function waitForEvent<T = unknown>(
  socket: Socket,
  event: string,
  timeoutMs = 5000,
): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error(`timed out waiting for "${event}"`)),
      timeoutMs,
    );
    socket.once(event, (payload: T) => {
      clearTimeout(timer);
      resolve(payload);
    });
  });
}

/** Emits with an acknowledgement callback, promisified. */
export function emitWithAck<T = unknown>(
  socket: Socket,
  event: string,
  payload: unknown,
  timeoutMs = 5000,
): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error(`ack for "${event}" timed out`)),
      timeoutMs,
    );
    socket.emit(event, payload, (response: T) => {
      clearTimeout(timer);
      resolve(response);
    });
  });
}
