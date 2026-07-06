import { ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import compression from 'compression';
import type { NextFunction, Request, Response } from 'express';
import helmet from 'helmet';
import { Logger } from 'nestjs-pino';
import { randomUUID } from 'node:crypto';
import { AppModule } from './app.module';
import { RequestContextService } from './common/request-context/request-context.service';
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

  // Request correlation: honor an incoming x-request-id (proxies/tests),
  // otherwise mint one; echo it on the response and seed the ALS store
  // that logging and auditing read for the rest of the request.
  const requestContext = app.get(RequestContextService);
  app.use(
    (
      req: Request & { id?: string },
      res: Response,
      next: NextFunction,
    ) => {
      const requestId =
        (req.headers['x-request-id'] as string | undefined) ?? randomUUID();
      req.id = requestId;
      res.setHeader('x-request-id', requestId);
      requestContext.run(
        {
          requestId,
          ipAddress: req.ip ?? null,
          userAgent: req.headers['user-agent'] ?? null,
        },
        next,
      );
    },
  );
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
