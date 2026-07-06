import { Injectable } from '@nestjs/common';

/**
 * Online-status groundwork: which users have live sockets on THIS
 * instance. Intentionally instance-local — when the API scales past one
 * process, presence moves to Redis keys (alongside the Socket.IO Redis
 * adapter) and this class becomes the write-through layer. No UI consumes
 * it yet.
 */
@Injectable()
export class ConnectionRegistryService {
  private readonly socketsByUser = new Map<string, Set<string>>();

  add(userId: string, socketId: string): void {
    const sockets = this.socketsByUser.get(userId) ?? new Set<string>();
    sockets.add(socketId);
    this.socketsByUser.set(userId, sockets);
  }

  remove(userId: string, socketId: string): void {
    const sockets = this.socketsByUser.get(userId);
    if (!sockets) return;
    sockets.delete(socketId);
    if (sockets.size === 0) {
      this.socketsByUser.delete(userId);
    }
  }

  isOnline(userId: string): boolean {
    return this.socketsByUser.has(userId);
  }

  onlineUserIds(): string[] {
    return [...this.socketsByUser.keys()];
  }

  /** Total open agent sockets (a user may hold several tabs). */
  socketCount(): number {
    let count = 0;
    for (const sockets of this.socketsByUser.values()) {
      count += sockets.size;
    }
    return count;
  }
}
