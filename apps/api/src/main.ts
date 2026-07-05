import { ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import compression from 'compression';
import helmet from 'helmet';
import { Logger } from 'nestjs-pino';
import { AppModule } from './app.module';
import { AppConfig } from './config/configuration';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule, { bufferLogs: true });

  const logger = app.get(Logger);
  app.useLogger(logger);

  const config = app.get(ConfigService<AppConfig, true>);
  const isDevelopment = config.get('nodeEnv', { infer: true }) === 'development';

  // Helmet's default CSP blocks Swagger UI's inline scripts in development.
  app.use(helmet({ contentSecurityPolicy: isDevelopment ? false : undefined }));
  app.use(compression());
  app.enableCors({ origin: true, credentials: true });

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  app.enableShutdownHooks();

  if (isDevelopment) {
    const swaggerConfig = new DocumentBuilder()
      .setTitle('Helio API')
      .setDescription('AI-powered customer communication platform')
      .setVersion('1.0')
      .build();
    SwaggerModule.setup(
      'docs',
      app,
      SwaggerModule.createDocument(app, swaggerConfig),
    );
  }

  const port = config.get('port', { infer: true });
  await app.listen(port, '0.0.0.0');
  logger.log(`API listening on port ${port}`);
}

void bootstrap();
