import { INestApplication } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import type { Logger } from "nestjs-pino";
import { DataSource } from "typeorm";
import { RedisService } from "../redis/redis.service";
import { appVersion } from "./app-version";
import { AppConfig } from "./configuration";

/**
 * Structured one-shot startup report: what is running, what is degraded,
 * and where. Optional providers that are not configured produce warnings
 * (feature disabled), never failures — see env.validation.ts. No secret
 * values are ever printed, only presence/absence.
 */
export async function logStartupSummary(
  app: INestApplication,
  logger: Logger,
): Promise<void> {
  const config = app.get(ConfigService<AppConfig, true>);

  const environment = config.get("nodeEnv", { infer: true });
  const apiUrl = await app.getUrl();
  const dashboardUrl = config.get("dashboardUrl", { infer: true });
  const corsOrigins = config.get("corsOrigins", { infer: true });

  let migrationVersion = "unknown";
  try {
    const rows = (await app
      .get(DataSource)
      .query("SELECT name FROM migrations ORDER BY id DESC LIMIT 1")) as {
      name: string;
    }[];
    migrationVersion = rows[0]?.name ?? "none";
  } catch {
    // The migrations table may not exist on a brand-new database.
  }

  let redisConnected = false;
  try {
    await app.get(RedisService).ping();
    redisConnected = true;
  } catch {
    redisConnected = false;
  }

  const geminiEnabled = !!config.get("gemini.apiKey", { infer: true });
  const resendEnabled = !!config.get("resend.apiKey", { infer: true });
  const storage = config.get("storage", { infer: true });
  const s3Configured = !!(storage.aws.region && storage.aws.bucket);

  logger.log(`Helio API v${appVersion()} — environment: ${environment}`);
  logger.log(`API listening at ${apiUrl}`);
  logger.log(`Dashboard URL: ${dashboardUrl || "not configured"}`);
  logger.log(`Database: connected (migration: ${migrationVersion})`);
  logger.log(`Redis: ${redisConnected ? "connected" : "NOT connected"}`);
  logger.log("Socket.IO: initialized on the HTTP server (path /socket.io)");
  logger.log(
    `CORS: ${corsOrigins.length > 0 ? corsOrigins.join(", ") : "reflect any origin"}`,
  );

  if (geminiEnabled) {
    logger.log("AI (Gemini): enabled");
  } else {
    logger.warn("AI (Gemini): disabled — GEMINI_API_KEY is not set");
  }
  if (resendEnabled) {
    logger.log("Email (Resend): enabled");
  } else {
    logger.warn("Email (Resend): disabled — RESEND_API_KEY is not set");
  }
  if (storage.provider === "s3") {
    if (s3Configured) {
      logger.log(`Storage: S3 (bucket: ${storage.aws.bucket})`);
    } else {
      logger.warn(
        "Storage: S3 selected but AWS_REGION/AWS_S3_BUCKET are missing — uploads are unavailable until configured",
      );
    }
  } else {
    logger.log(`Storage: local filesystem (${storage.localDir})`);
  }

  logger.log("Widget: bundles served by the dashboard at /widget.js");
  logger.log("Workspace mode: multi-workspace (workspace switching enabled)");

  if (environment === "production" && corsOrigins.length === 0) {
    logger.warn(
      "CORS_ORIGINS is not set — any browser origin is accepted (required for widget embeds on arbitrary sites; safe because auth is Bearer-token, not cookies). Set it to lock the API to known origins, including every site that embeds the chat widget.",
    );
  }
}
