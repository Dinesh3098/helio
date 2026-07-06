import {
  CanActivate,
  ExecutionContext,
  HttpException,
  HttpStatus,
  Injectable,
} from "@nestjs/common";
import type { AuthenticatedUser } from "../../common/interfaces/authenticated-user.interface";
import { RedisService } from "../../redis/redis.service";

/** Per-user budget across ALL AI endpoints (they share one Gemini quota). */
const MAX_REQUESTS = 30;
const WINDOW_SECONDS = 300;

/**
 * Fixed-window counter in Redis — shared across instances, expires on its
 * own. Runs after JwtAuthGuard (needs request.user). Fails open if Redis
 * is down: losing rate limiting briefly beats taking AI features down.
 */
@Injectable()
export class AiRateLimitGuard implements CanActivate {
  constructor(private readonly redisService: RedisService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context
      .switchToHttp()
      .getRequest<{ user?: AuthenticatedUser }>();
    const userId = request.user?.id;
    if (!userId) return true; // JwtAuthGuard rejects before this matters.

    const key = `ai:ratelimit:${userId}`;
    try {
      const redis = this.redisService.getClient();
      const count = await redis.incr(key);
      if (count === 1) {
        await redis.expire(key, WINDOW_SECONDS);
      }
      if (count > MAX_REQUESTS) {
        throw new HttpException(
          `AI request limit reached (${MAX_REQUESTS} per ${WINDOW_SECONDS / 60} minutes). Try again shortly.`,
          HttpStatus.TOO_MANY_REQUESTS,
        );
      }
      return true;
    } catch (error) {
      if (error instanceof HttpException) throw error;
      return true;
    }
  }
}
