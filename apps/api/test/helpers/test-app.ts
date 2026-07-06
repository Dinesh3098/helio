import { INestApplication, ValidationPipe } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import type { NextFunction, Request, Response } from "express";
import { randomUUID } from "node:crypto";
import { AppModule } from "../../src/app.module";
import { RequestContextService } from "../../src/common/request-context/request-context.service";

/**
 * Boots the real AppModule against the integration database with the
 * same global pipes AND request-context middleware as main.ts — without
 * the ALS seeding, audit rows would record a null actor and tests would
 * diverge from production behavior. One app per test file: create in
 * beforeAll, close in afterAll — never share across files.
 */
export async function createTestApp(): Promise<INestApplication> {
  const moduleRef = await Test.createTestingModule({
    imports: [AppModule],
  }).compile();

  const app = moduleRef.createNestApplication({ logger: false });

  const requestContext = app.get(RequestContextService);
  app.use((req: Request, res: Response, next: NextFunction) => {
    requestContext.run(
      {
        requestId: randomUUID(),
        ipAddress: req.ip ?? null,
        userAgent: req.headers["user-agent"] ?? null,
      },
      next,
    );
  });

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );
  await app.init();
  return app;
}

/**
 * Same app, but bound to an ephemeral port — required for Socket.IO
 * tests, where a real HTTP server must accept websocket upgrades.
 */
export async function createListeningTestApp(): Promise<{
  app: INestApplication;
  baseUrl: string;
}> {
  const app = await createTestApp();
  await app.listen(0);
  const url = await app.getUrl();
  // getUrl may return an IPv6 loopback form; normalize for clients.
  const baseUrl = url.replace("[::1]", "127.0.0.1");
  return { app, baseUrl };
}
