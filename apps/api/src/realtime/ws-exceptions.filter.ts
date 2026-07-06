import { ArgumentsHost, Catch, HttpException } from "@nestjs/common";
import { BaseWsExceptionFilter, WsException } from "@nestjs/websockets";
import type { Socket } from "socket.io";
import { SERVER_EVENTS } from "./realtime.events";

/**
 * Uncaught handler/pipe errors become a messageError emit to the sender
 * instead of a dropped event. Service-layer HttpExceptions (404/403/409)
 * pass their message through; anything else stays generic.
 */
@Catch()
export class WsExceptionsFilter extends BaseWsExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost): void {
    const client = host.switchToWs().getClient<Socket>();

    let message = "Something went wrong";
    if (exception instanceof WsException) {
      const error = exception.getError();
      message = typeof error === "string" ? error : exception.message;
    } else if (exception instanceof HttpException) {
      message = exception.message;
    }

    client.emit(SERVER_EVENTS.messageError, { message });
  }
}
