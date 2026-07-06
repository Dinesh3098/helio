import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from "@nestjs/common";
import { HttpAdapterHost } from "@nestjs/core";

/**
 * Catch-all exception filter: known HttpExceptions pass through with their
 * status and payload; anything else becomes an opaque 500 so internals
 * never leak to clients. Unexpected errors are logged with their stack.
 */
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger(AllExceptionsFilter.name);

  constructor(private readonly httpAdapterHost: HttpAdapterHost) {}

  catch(exception: unknown, host: ArgumentsHost): void {
    const { httpAdapter } = this.httpAdapterHost;
    const ctx = host.switchToHttp();
    const path = httpAdapter.getRequestUrl(ctx.getRequest()) as string;

    const isHttpException = exception instanceof HttpException;
    const status = isHttpException
      ? exception.getStatus()
      : HttpStatus.INTERNAL_SERVER_ERROR;

    const payload = isHttpException
      ? exception.getResponse()
      : { statusCode: status, message: "Internal server error" };

    const body = {
      ...(typeof payload === "string"
        ? { statusCode: status, message: payload }
        : payload),
      timestamp: new Date().toISOString(),
      path,
    };

    if (!isHttpException) {
      this.logger.error(
        exception instanceof Error ? exception.message : String(exception),
        exception instanceof Error ? exception.stack : undefined,
      );
    }

    httpAdapter.reply(ctx.getResponse(), body, status);
  }
}
