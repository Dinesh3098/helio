import {
  Controller,
  Get,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  HealthCheckResult,
  HealthCheckService,
  TypeOrmHealthIndicator,
} from '@nestjs/terminus';
import * as os from 'node:os';
import { appVersion } from '../config/app-version';
import { AppConfig } from '../config/configuration';
import { StorageService } from '../modules/storage/storage.service';
import { ConnectionRegistryService } from '../realtime/connection-registry.service';
import { RedisHealthIndicator } from './redis.health';

type ComponentStatus = 'up' | 'down' | 'degraded' | 'disabled';

interface HealthReport {
  status: 'ok' | 'degraded' | 'down';
  version: string;
  environment: string;
  uptimeSeconds: number;
  checks: {
    database: { status: ComponentStatus };
    redis: { status: ComponentStatus };
    socket: { status: ComponentStatus; connectedSockets: number };
    ai: { provider: string; status: ComponentStatus };
    email: { provider: string; status: ComponentStatus };
    storage: { provider: string; status: ComponentStatus; reason?: string };
  };
  system: {
    memory: { rssMb: number; heapUsedMb: number; heapTotalMb: number };
    cpu: { loadAverage: number[]; cores: number };
  };
}

/**
 * Production health report. Semantics:
 * - database/redis down          → "down", HTTP 503 (the app cannot serve)
 * - storage backend unavailable  → "degraded", HTTP 200 (uploads alone fail)
 * - AI/email key not configured  → "degraded", HTTP 200 (feature disabled)
 * Docker HEALTHCHECK and load balancers key off the status code, so a
 * degraded-but-serving instance keeps receiving traffic.
 */
@Controller('health')
export class HealthController {
  constructor(
    private readonly health: HealthCheckService,
    private readonly db: TypeOrmHealthIndicator,
    private readonly redis: RedisHealthIndicator,
    private readonly storage: StorageService,
    private readonly connectionRegistry: ConnectionRegistryService,
    private readonly config: ConfigService<AppConfig, true>,
  ) {}

  @Get()
  async check(): Promise<HealthReport> {
    // Critical infrastructure through the existing Terminus indicators.
    let critical: HealthCheckResult;
    try {
      critical = await this.health.check([
        () => this.db.pingCheck('database', { timeout: 5000 }),
        () => this.redis.isHealthy('redis'),
      ]);
    } catch (error) {
      if (error instanceof ServiceUnavailableException) {
        critical = error.getResponse() as HealthCheckResult;
      } else {
        throw error;
      }
    }

    const databaseUp = critical.details?.database?.status === 'up';
    const redisUp = critical.details?.redis?.status === 'up';

    const storageHealth = await this.storage.healthCheck();
    const aiEnabled = !!this.config.get('gemini.apiKey', { infer: true });
    const emailEnabled = !!this.config.get('resend.apiKey', { infer: true });

    const memory = process.memoryUsage();
    const toMb = (bytes: number): number =>
      Math.round((bytes / 1024 / 1024) * 10) / 10;

    const report: HealthReport = {
      status: 'ok',
      version: appVersion(),
      environment: this.config.get('nodeEnv', { infer: true }),
      uptimeSeconds: Math.round(process.uptime()),
      checks: {
        database: { status: databaseUp ? 'up' : 'down' },
        redis: { status: redisUp ? 'up' : 'down' },
        socket: {
          // The gateway shares the HTTP server: if this handler runs,
          // the Socket.IO server is accepting connections.
          status: 'up',
          connectedSockets: this.connectionRegistry.socketCount(),
        },
        ai: { provider: 'gemini', status: aiEnabled ? 'up' : 'disabled' },
        email: {
          provider: 'resend',
          status: emailEnabled ? 'up' : 'disabled',
        },
        storage: {
          provider: this.storage.providerName,
          status: storageHealth.available ? 'up' : 'degraded',
          ...(storageHealth.reason ? { reason: storageHealth.reason } : {}),
        },
      },
      system: {
        memory: {
          rssMb: toMb(memory.rss),
          heapUsedMb: toMb(memory.heapUsed),
          heapTotalMb: toMb(memory.heapTotal),
        },
        cpu: { loadAverage: os.loadavg(), cores: os.cpus().length },
      },
    };

    if (!databaseUp || !redisUp) {
      report.status = 'down';
      throw new ServiceUnavailableException(report);
    }
    if (!storageHealth.available || !aiEnabled || !emailEnabled) {
      report.status = 'degraded';
    }
    return report;
  }
}
