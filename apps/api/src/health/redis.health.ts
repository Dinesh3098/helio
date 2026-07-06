import { Injectable } from "@nestjs/common";
import {
  HealthIndicatorResult,
  HealthIndicatorService,
} from "@nestjs/terminus";
import { RedisService } from "../redis/redis.service";

@Injectable()
export class RedisHealthIndicator {
  constructor(
    private readonly healthIndicatorService: HealthIndicatorService,
    private readonly redisService: RedisService,
  ) {}

  async isHealthy(key: string): Promise<HealthIndicatorResult> {
    const indicator = this.healthIndicatorService.check(key);
    try {
      await this.redisService.ping();
      return indicator.up();
    } catch (error) {
      return indicator.down({
        message: error instanceof Error ? error.message : "Redis ping failed",
      });
    }
  }
}
