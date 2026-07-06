import Joi from "joi";

/**
 * Fail-fast validation of process.env at bootstrap.
 *
 * Only infrastructure the app cannot run without is required: database,
 * Redis and JWT. Third-party providers (Gemini, Resend, S3) are optional
 * in every environment — when a key is absent the feature is disabled
 * with a startup warning and the rest of the platform keeps working
 * (their providers already fail soft with an "unavailable" error at
 * request time).
 */
export const envValidationSchema = Joi.object({
  NODE_ENV: Joi.string()
    .valid("development", "production", "test")
    .default("development"),
  PORT: Joi.number().port().default(4000),
  DATABASE_URL: Joi.string()
    .uri({ scheme: ["postgres", "postgresql"] })
    .required(),
  REDIS_URL: Joi.string()
    .uri({ scheme: ["redis", "rediss"] })
    .required(),
  JWT_SECRET: Joi.string().min(32).required(),
  JWT_ACCESS_EXPIRES_IN: Joi.string().default("15m"),
  JWT_REFRESH_EXPIRES_IN_DAYS: Joi.number().integer().min(1).default(30),
  // Optional providers: missing keys disable the feature, never the app.
  GEMINI_API_KEY: Joi.string().optional().allow(""),
  RESEND_API_KEY: Joi.string().optional().allow(""),
  STORAGE_PROVIDER: Joi.string().valid("s3", "local").default("local"),
  STORAGE_MAX_FILE_SIZE_MB: Joi.number().integer().min(1).default(10),
  STORAGE_LOCAL_DIR: Joi.string().default("storage"),
  // Only used when STORAGE_PROVIDER=s3; if incomplete, uploads degrade
  // to "unavailable" while everything else stays up.
  AWS_REGION: Joi.string().optional().allow(""),
  AWS_S3_BUCKET: Joi.string().optional().allow(""),
  AWS_ACCESS_KEY_ID: Joi.string().optional().allow(""),
  AWS_SECRET_ACCESS_KEY: Joi.string().optional().allow(""),
  // Comma-separated list of allowed browser origins. Empty = reflect any
  // origin (development convenience).
  CORS_ORIGINS: Joi.string().optional().allow(""),
  // Public URL of the dashboard — used for startup logging only.
  DASHBOARD_URL: Joi.string().uri().optional().allow(""),
});
