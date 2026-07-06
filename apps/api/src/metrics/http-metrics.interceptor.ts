import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { Observable } from 'rxjs';
import { tap } from 'rxjs/operators';
import { MetricsService } from './metrics.service';

/**
 * Times every HTTP request. Uses the route PATTERN (/conversations/:id),
 * never the concrete URL — raw ids in labels would explode Prometheus
 * cardinality.
 */
@Injectable()
export class HttpMetricsInterceptor implements NestInterceptor {
  constructor(private readonly metricsService: MetricsService) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    if (context.getType() !== 'http') return next.handle();

    const started = process.hrtime.bigint();
    const request = context
      .switchToHttp()
      .getRequest<Request & { route?: { path?: string } }>();
    const response = context.switchToHttp().getResponse<Response>();

    const record = () => {
      const seconds =
        Number(process.hrtime.bigint() - started) / 1_000_000_000;
      this.metricsService.recordHttp(
        request.method,
        request.route?.path ?? request.path,
        response.statusCode,
        seconds,
      );
    };

    return next.handle().pipe(tap({ next: record, error: record }));
  }
}
