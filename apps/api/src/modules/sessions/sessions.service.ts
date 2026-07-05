import { createHash, randomBytes } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { EntityManager, IsNull, MoreThan, Repository } from 'typeorm';
import { AppConfig } from '../../config/configuration';
import { UserSession } from '../../database/entities';

/**
 * Owns the user_sessions table. Refresh tokens are 384-bit random strings;
 * only their SHA-256 hash is persisted. SHA-256 (not bcrypt) is deliberate:
 * the token has full random entropy so a fast hash is safe, and a
 * deterministic hash allows indexed lookup — bcrypt's per-hash salt would
 * make sessions unfindable by token.
 */
@Injectable()
export class SessionsService {
  private readonly refreshTtlDays: number;

  constructor(
    @InjectRepository(UserSession)
    private readonly sessionsRepository: Repository<UserSession>,
    config: ConfigService<AppConfig, true>,
  ) {
    this.refreshTtlDays = config.get('jwt.refreshExpiresInDays', {
      infer: true,
    });
  }

  generateRefreshToken(): string {
    return randomBytes(48).toString('base64url');
  }

  private hashToken(token: string): string {
    return createHash('sha256').update(token).digest('hex');
  }

  private expiryDate(): Date {
    return new Date(Date.now() + this.refreshTtlDays * 24 * 60 * 60 * 1000);
  }

  /**
   * Accepts an EntityManager so signup can create the session inside its
   * transaction.
   */
  async createSession(
    userId: string,
    refreshToken: string,
    manager?: EntityManager,
  ): Promise<UserSession> {
    const repository = manager
      ? manager.getRepository(UserSession)
      : this.sessionsRepository;
    return repository.save(
      repository.create({
        userId,
        refreshTokenHash: this.hashToken(refreshToken),
        expiresAt: this.expiryDate(),
      }),
    );
  }

  async findValidByToken(refreshToken: string): Promise<UserSession | null> {
    return this.sessionsRepository.findOne({
      where: {
        refreshTokenHash: this.hashToken(refreshToken),
        revokedAt: IsNull(),
        expiresAt: MoreThan(new Date()),
      },
    });
  }

  /**
   * Rotation: the presented token's hash is overwritten with a new one, so
   * a replayed old token no longer matches any session (reuse prevention).
   */
  async rotate(session: UserSession): Promise<string> {
    const newToken = this.generateRefreshToken();
    session.refreshTokenHash = this.hashToken(newToken);
    session.expiresAt = this.expiryDate();
    await this.sessionsRepository.save(session);
    return newToken;
  }

  /**
   * Idempotent: revoking an unknown or already-revoked token is a no-op so
   * logout never leaks whether a token was valid.
   */
  async revokeByToken(refreshToken: string): Promise<void> {
    await this.sessionsRepository.update(
      { refreshTokenHash: this.hashToken(refreshToken), revokedAt: IsNull() },
      { revokedAt: new Date() },
    );
  }
}
