export interface AppConfig {
  nodeEnv: string;
  port: number;
  database: { url: string };
  redis: { url: string };
  jwt: { secret: string };
  gemini: { apiKey: string };
  resend: { apiKey: string };
}

export default (): AppConfig => ({
  nodeEnv: process.env.NODE_ENV ?? 'development',
  port: parseInt(process.env.PORT ?? '4000', 10),
  database: { url: process.env.DATABASE_URL ?? '' },
  redis: { url: process.env.REDIS_URL ?? '' },
  jwt: { secret: process.env.JWT_SECRET ?? '' },
  gemini: { apiKey: process.env.GEMINI_API_KEY ?? '' },
  resend: { apiKey: process.env.RESEND_API_KEY ?? '' },
});
