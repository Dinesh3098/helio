import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';
import { AppConfig } from '../config/configuration';

/**
 * Single shared Redis connection for the app (cache, presence, rate
 * limiting later). BullMQ will create its own connections when introduced.
 */
@Injectable()
export class RedisService implements OnModuleDestroy {
  private readonly logger = new Logger(RedisService.name);
  private readonly client: Redis;

  constructor(config: ConfigService<AppConfig, true>) {
    this.client = new Redis(config.get('redis.url', { infer: true }), {
      maxRetriesPerRequest: 3,
    });

    this.client.on('ready', () => this.logger.log('Redis connection ready'));
    this.client.on('error', (error) =>
      this.logger.error(`Redis connection error: ${error.message}`),
    );
  }

  getClient(): Redis {
    return this.client;
  }

  async ping(): Promise<string> {
    return this.client.ping();
  }

  async onModuleDestroy(): Promise<void> {
    await this.client.quit();
  }
}
