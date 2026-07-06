import Joi from 'joi';

/**
 * Fail-fast validation of process.env at bootstrap.
 * Third-party API keys are only enforced in production because no code
 * consumes them yet; local development must not require paid credentials.
 */
export const envValidationSchema = Joi.object({
  NODE_ENV: Joi.string()
    .valid('development', 'production', 'test')
    .default('development'),
  PORT: Joi.number().port().default(4000),
  DATABASE_URL: Joi.string()
    .uri({ scheme: ['postgres', 'postgresql'] })
    .required(),
  REDIS_URL: Joi.string()
    .uri({ scheme: ['redis', 'rediss'] })
    .required(),
  JWT_SECRET: Joi.string().min(32).required(),
  JWT_ACCESS_EXPIRES_IN: Joi.string().default('15m'),
  JWT_REFRESH_EXPIRES_IN_DAYS: Joi.number().integer().min(1).default(30),
  GEMINI_API_KEY: Joi.string().when('NODE_ENV', {
    is: 'production',
    then: Joi.required(),
    otherwise: Joi.optional().allow(''),
  }),
  RESEND_API_KEY: Joi.string().when('NODE_ENV', {
    is: 'production',
    then: Joi.required(),
    otherwise: Joi.optional().allow(''),
  }),
  STORAGE_PROVIDER: Joi.string().valid('s3', 'local').default('local'),
  STORAGE_MAX_FILE_SIZE_MB: Joi.number().integer().min(1).default(10),
  STORAGE_LOCAL_DIR: Joi.string().default('storage'),
  // AWS settings are only required when the s3 provider is selected.
  AWS_REGION: Joi.string().when('STORAGE_PROVIDER', {
    is: 's3',
    then: Joi.required(),
    otherwise: Joi.optional().allow(''),
  }),
  AWS_S3_BUCKET: Joi.string().when('STORAGE_PROVIDER', {
    is: 's3',
    then: Joi.required(),
    otherwise: Joi.optional().allow(''),
  }),
  AWS_ACCESS_KEY_ID: Joi.string().when('STORAGE_PROVIDER', {
    is: 's3',
    then: Joi.required(),
    otherwise: Joi.optional().allow(''),
  }),
  AWS_SECRET_ACCESS_KEY: Joi.string().when('STORAGE_PROVIDER', {
    is: 's3',
    then: Joi.required(),
    otherwise: Joi.optional().allow(''),
  }),
});
