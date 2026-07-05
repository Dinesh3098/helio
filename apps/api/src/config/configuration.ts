export interface AppConfig {
  nodeEnv: string;
  port: number;
  database: { url: string };
  redis: { url: string };
  jwt: {
    secret: string;
    accessExpiresIn: string;
    refreshExpiresInDays: number;
  };
  gemini: { apiKey: string };
  resend: { apiKey: string };
}

export default (): AppConfig => ({
  nodeEnv: process.env.NODE_ENV ?? 'development',
  port: parseInt(process.env.PORT ?? '4000', 10),
  database: { url: process.env.DATABASE_URL ?? '' },
  redis: { url: process.env.REDIS_URL ?? '' },
  jwt: {
    secret: process.env.JWT_SECRET ?? '',
    accessExpiresIn: process.env.JWT_ACCESS_EXPIRES_IN ?? '15m',
    refreshExpiresInDays: parseInt(
      process.env.JWT_REFRESH_EXPIRES_IN_DAYS ?? '30',
      10,
    ),
  },
  gemini: { apiKey: process.env.GEMINI_API_KEY ?? '' },
  resend: { apiKey: process.env.RESEND_API_KEY ?? '' },
});
