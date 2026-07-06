import { Module } from "@nestjs/common";
import { TerminusModule } from "@nestjs/terminus";
import { StorageModule } from "../modules/storage/storage.module";
import { RealtimeEmitterModule } from "../realtime/realtime-emitter.module";
import { HealthController } from "./health.controller";
import { RedisHealthIndicator } from "./redis.health";

@Module({
  imports: [TerminusModule, StorageModule, RealtimeEmitterModule],
  controllers: [HealthController],
  providers: [RedisHealthIndicator],
})
export class HealthModule {}
