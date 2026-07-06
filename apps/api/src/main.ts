import { ValidationPipe } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { NestFactory } from "@nestjs/core";
import type { NestExpressApplication } from "@nestjs/platform-express";
import { DocumentBuilder, SwaggerModule } from "@nestjs/swagger";
import compression from "compression";
import type { NextFunction, Request, Response } from "express";
import helmet from "helmet";
import { Logger } from "nestjs-pino";
import { randomUUID } from "node:crypto";
import { AppModule } from "./app.module";
import { RequestContextService } from "./common/request-context/request-context.service";
import { AppConfig } from "./config/configuration";
import { logStartupSummary } from "./config/startup-summary";

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    bufferLogs: true,
  });

  const logger = app.get(Logger);
  app.useLogger(logger);

  const config = app.get(ConfigService<AppConfig, true>);
  const isDevelopment =
    config.get("nodeEnv", { infer: true }) === "development";

  // Behind a reverse proxy / Docker network the client IP arrives in
  // X-Forwarded-For; without this req.ip (rate limiting, audit trail)
  // would record the proxy address.
  app.set("trust proxy", 1);

  // Helmet's default CSP blocks Swagger UI's inline scripts in development.
  app.use(helmet({ contentSecurityPolicy: isDevelopment ? false : undefined }));
  app.use(compression());

  // Request correlation: honor an incoming x-request-id (proxies/tests),
  // otherwise mint one; echo it on the response and seed the ALS store
  // that logging and auditing read for the rest of the request.
  const requestContext = app.get(RequestContextService);
  app.use(
    (req: Request & { id?: string }, res: Response, next: NextFunction) => {
      const requestId =
        (req.headers["x-request-id"] as string | undefined) ?? randomUUID();
      req.id = requestId;
      res.setHeader("x-request-id", requestId);
      requestContext.run(
        {
          requestId,
          ipAddress: req.ip ?? null,
          userAgent: req.headers["user-agent"] ?? null,
        },
        next,
      );
    },
  );

  // Origins come from CORS_ORIGINS (comma-separated); an empty list
  // reflects any origin — fine in development, warned about in production.
  const corsOrigins = config.get("corsOrigins", { infer: true });
  app.enableCors({
    origin: corsOrigins.length > 0 ? corsOrigins : true,
    credentials: true,
  });

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  if (isDevelopment) {
    const swaggerConfig = new DocumentBuilder()
      .setTitle("Helio API")
      .setDescription("AI-powered customer communication platform")
      .setVersion("1.0")
      .build();
    SwaggerModule.setup(
      "docs",
      app,
      SwaggerModule.createDocument(app, swaggerConfig),
    );
  }

  // Explicit graceful shutdown (instead of enableShutdownHooks) so we own
  // the ordering: stop accepting connections, run every Nest lifecycle
  // hook (Socket.IO detaches with the HTTP server; RedisService quits its
  // client; TypeORM destroys the pool), then exit. Pino writes
  // synchronously to stdout, so nothing is left unflushed.
  let shuttingDown = false;
  const shutdown = (signal: string): void => {
    if (shuttingDown) return;
    shuttingDown = true;
    logger.log(`${signal} received — shutting down gracefully`);
    app.close().then(
      () => {
        logger.log("Shutdown complete");
        process.exit(0);
      },
      (error: unknown) => {
        logger.error(
          `Shutdown failed: ${error instanceof Error ? error.message : "unknown"}`,
        );
        process.exit(1);
      },
    );
  };
  process.once("SIGTERM", () => shutdown("SIGTERM"));
  process.once("SIGINT", () => shutdown("SIGINT"));

  const port = config.get("port", { infer: true });
  await app.listen(port, "0.0.0.0");
  await logStartupSummary(app, logger);
}

void bootstrap();
