import { Global, Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { Conversation } from "../database/entities";
import { RealtimeEmitterModule } from "../realtime/realtime-emitter.module";
import { HttpMetricsInterceptor } from "./http-metrics.interceptor";
import { MetricsController } from "./metrics.controller";
import { MetricsService } from "./metrics.service";

/**
 * Global so business services (AI, email, widget) can increment counters
 * with a bare constructor injection.
 */
@Global()
@Module({
  imports: [TypeOrmModule.forFeature([Conversation]), RealtimeEmitterModule],
  controllers: [MetricsController],
  providers: [MetricsService, HttpMetricsInterceptor],
  exports: [MetricsService, HttpMetricsInterceptor],
})
export class MetricsModule {}
