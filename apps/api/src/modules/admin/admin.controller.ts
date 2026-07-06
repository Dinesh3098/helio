import { Controller, Get, UseGuards } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { InjectDataSource } from "@nestjs/typeorm";
import {
  ApiBearerAuth,
  ApiHeader,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from "@nestjs/swagger";
import { DataSource } from "typeorm";
import { Roles } from "../../common/decorators/roles.decorator";
import { RolesGuard } from "../../common/guards/roles.guard";
import { WorkspaceMemberRole } from "../../database/entities";
import { AppConfig } from "../../config/configuration";
import { RedisService } from "../../redis/redis.service";
import { ConnectionRegistryService } from "../../realtime/connection-registry.service";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import { SystemStatusDto } from "./dto/system-status.dto";
// Version is compile-time metadata; requiring the manifest is standard.
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { version } = require("../../../package.json") as { version: string };

/**
 * Operational snapshot for the dashboard's System Health page. Read-only
 * and owner/admin-gated; each dependency is probed live with its latency.
 */
@ApiTags("admin")
@ApiBearerAuth()
@ApiHeader({ name: "x-workspace-id", required: false })
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller("admin")
export class AdminController {
  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly redisService: RedisService,
    private readonly connectionRegistry: ConnectionRegistryService,
    private readonly config: ConfigService<AppConfig, true>,
  ) {}

  @Get("system")
  @Roles(WorkspaceMemberRole.OWNER, WorkspaceMemberRole.ADMIN)
  @ApiOperation({ summary: "Live system health snapshot" })
  @ApiOkResponse({ type: SystemStatusDto })
  async system(): Promise<SystemStatusDto> {
    const [postgres, redis] = await Promise.all([
      this.probe(() => this.dataSource.query("SELECT 1")),
      this.probe(() => this.redisService.ping()),
    ]);

    const memory = process.memoryUsage();
    return {
      services: [
        { name: "PostgreSQL", ...postgres },
        { name: "Redis", ...redis },
        {
          name: "AI (Gemini)",
          status: this.config.get("gemini.apiKey", { infer: true })
            ? "configured"
            : "unconfigured",
        },
        {
          name: "Email (Resend)",
          status: this.config.get("resend.apiKey", { infer: true })
            ? "configured"
            : "unconfigured",
        },
      ],
      sockets: {
        connections: this.connectionRegistry.socketCount(),
        users: this.connectionRegistry.onlineUserIds().length,
      },
      uptimeSeconds: Math.round(process.uptime()),
      memory: {
        rssMb: Math.round(memory.rss / 1024 / 1024),
        heapUsedMb: Math.round(memory.heapUsed / 1024 / 1024),
        heapTotalMb: Math.round(memory.heapTotal / 1024 / 1024),
      },
      version,
      environment: this.config.get("nodeEnv", { infer: true }),
      node: process.version,
    };
  }

  private async probe(
    check: () => Promise<unknown>,
  ): Promise<{ status: "up" | "down"; latencyMs?: number }> {
    const started = Date.now();
    try {
      await check();
      return { status: "up", latencyMs: Date.now() - started };
    } catch {
      return { status: "down" };
    }
  }
}
