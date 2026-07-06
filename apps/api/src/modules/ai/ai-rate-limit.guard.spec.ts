import { ExecutionContext, HttpException, HttpStatus } from "@nestjs/common";
import { RedisService } from "../../redis/redis.service";
import { AiRateLimitGuard } from "./ai-rate-limit.guard";

describe("AiRateLimitGuard", () => {
  let redisClient: { incr: jest.Mock; expire: jest.Mock };
  let redisService: { getClient: jest.Mock };
  let guard: AiRateLimitGuard;

  const contextFor = (user?: { id: string }): ExecutionContext =>
    ({
      switchToHttp: () => ({ getRequest: () => ({ user }) }),
    }) as unknown as ExecutionContext;

  beforeEach(() => {
    redisClient = {
      incr: jest.fn().mockResolvedValue(2),
      expire: jest.fn().mockResolvedValue(1),
    };
    redisService = { getClient: jest.fn(() => redisClient) };
    guard = new AiRateLimitGuard(redisService as unknown as RedisService);
  });

  it("allows requests under the limit", async () => {
    redisClient.incr.mockResolvedValueOnce(30); // exactly at the cap is allowed

    await expect(guard.canActivate(contextFor({ id: "user-1" }))).resolves.toBe(
      true,
    );
  });

  it("keys the fixed window by user id", async () => {
    await guard.canActivate(contextFor({ id: "user-42" }));

    expect(redisClient.incr).toHaveBeenCalledWith("ai:ratelimit:user-42");
  });

  it("starts the window TTL on the first request only", async () => {
    redisClient.incr.mockResolvedValueOnce(1);
    await guard.canActivate(contextFor({ id: "user-1" }));
    expect(redisClient.expire).toHaveBeenCalledWith("ai:ratelimit:user-1", 300);

    redisClient.expire.mockClear();
    redisClient.incr.mockResolvedValueOnce(2);
    await guard.canActivate(contextFor({ id: "user-1" }));
    expect(redisClient.expire).not.toHaveBeenCalled();
  });

  it("throws HTTP 429 once the counter exceeds the limit", async () => {
    redisClient.incr.mockResolvedValueOnce(31);

    const error: unknown = await guard
      .canActivate(contextFor({ id: "user-1" }))
      .then(() => {
        throw new Error("expected rejection");
      })
      .catch((e: unknown) => e);

    expect(error).toBeInstanceOf(HttpException);
    expect((error as HttpException).getStatus()).toBe(
      HttpStatus.TOO_MANY_REQUESTS,
    );
  });

  it("fails open when redis errors", async () => {
    redisClient.incr.mockRejectedValueOnce(new Error("connection refused"));

    await expect(guard.canActivate(contextFor({ id: "user-1" }))).resolves.toBe(
      true,
    );
  });

  it("fails open when the redis client cannot be obtained", async () => {
    redisService.getClient.mockImplementationOnce(() => {
      throw new Error("redis down");
    });

    await expect(guard.canActivate(contextFor({ id: "user-1" }))).resolves.toBe(
      true,
    );
  });

  it("allows unauthenticated requests without touching redis (JwtAuthGuard's job)", async () => {
    await expect(guard.canActivate(contextFor(undefined))).resolves.toBe(true);

    expect(redisService.getClient).not.toHaveBeenCalled();
    expect(redisClient.incr).not.toHaveBeenCalled();
  });
});
