import { Global, Module } from "@nestjs/common";
import { RedisService } from "./redis.service";

/**
 * Global so infrastructure concerns (health, future rate limiting,
 * presence) can inject RedisService without repeated imports.
 */
@Global()
@Module({
  providers: [RedisService],
  exports: [RedisService],
})
export class RedisModule {}
