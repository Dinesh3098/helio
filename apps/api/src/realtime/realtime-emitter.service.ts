import { Injectable } from '@nestjs/common';
import type { Server } from 'socket.io';
import { conversationRoom, SERVER_EVENTS } from './realtime.events';

/**
 * Dependency-free bridge between business modules and the Socket.IO
 * server. The gateway hands the server over in afterInit; any module can
 * then broadcast without importing the gateway — which would create a
 * module cycle, since RealtimeModule already imports the business modules
 * the gateway authorizes against. Emits are no-ops until the gateway
 * initializes (nothing to notify before sockets exist).
 */
@Injectable()
export class RealtimeEmitterService {
  private server: Server | null = null;

  setServer(server: Server): void {
    this.server = server;
  }

  emitToConversation(
    conversationId: string,
    event: (typeof SERVER_EVENTS)[keyof typeof SERVER_EVENTS],
    payload: unknown,
  ): void {
    this.server?.to(conversationRoom(conversationId)).emit(event, payload);
  }
}
