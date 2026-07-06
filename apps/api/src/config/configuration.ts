export interface AppConfig {
  nodeEnv: string;
  port: number;
  /** Allowed browser origins; empty list = reflect any origin. */
  corsOrigins: string[];
  /** Public dashboard URL — informational (startup logs). */
  dashboardUrl: string;
  database: { url: string };
  redis: { url: string };
  jwt: {
    secret: string;
    accessExpiresIn: string;
    refreshExpiresInDays: number;
  };
  gemini: { apiKey: string };
  resend: { apiKey: string };
  storage: {
    provider: "s3" | "local";
    maxFileSizeMb: number;
    localDir: string;
    aws: {
      region: string;
      bucket: string;
      accessKeyId: string;
      secretAccessKey: string;
    };
  };
}

/**
 * Parses CORS_ORIGINS into the value Express/Socket.IO expect: an origin
 * allowlist, or `true` (reflect any origin) when unset. Reads process.env
 * directly because the Socket.IO gateway decorator evaluates at import
 * time, before ConfigModule has loaded .env files — in production the
 * variable comes from the real environment, so both readers agree.
 */
export const parseCorsOrigins = (): string[] =>
  (process.env.CORS_ORIGINS ?? "")
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean);

export const corsOriginSetting = (): true | string[] => {
  const origins = parseCorsOrigins();
  return origins.length > 0 ? origins : true;
};

export default (): AppConfig => ({
  nodeEnv: process.env.NODE_ENV ?? "development",
  port: parseInt(process.env.PORT ?? "4000", 10),
  corsOrigins: parseCorsOrigins(),
  dashboardUrl: process.env.DASHBOARD_URL ?? "",
  database: { url: process.env.DATABASE_URL ?? "" },
  redis: { url: process.env.REDIS_URL ?? "" },
  jwt: {
    secret: process.env.JWT_SECRET ?? "",
    accessExpiresIn: process.env.JWT_ACCESS_EXPIRES_IN ?? "15m",
    refreshExpiresInDays: parseInt(
      process.env.JWT_REFRESH_EXPIRES_IN_DAYS ?? "30",
      10,
    ),
  },
  gemini: { apiKey: process.env.GEMINI_API_KEY ?? "" },
  resend: { apiKey: process.env.RESEND_API_KEY ?? "" },
  storage: {
    provider:
      process.env.STORAGE_PROVIDER === "s3"
        ? ("s3" as const)
        : ("local" as const),
    maxFileSizeMb: parseInt(process.env.STORAGE_MAX_FILE_SIZE_MB ?? "10", 10),
    localDir: process.env.STORAGE_LOCAL_DIR ?? "storage",
    aws: {
      region: process.env.AWS_REGION ?? "",
      bucket: process.env.AWS_S3_BUCKET ?? "",
      accessKeyId: process.env.AWS_ACCESS_KEY_ID ?? "",
      secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY ?? "",
    },
  },
});
