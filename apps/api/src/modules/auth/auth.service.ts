import {
  ConflictException,
  Injectable,
  UnauthorizedException,
} from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import bcrypt from "bcrypt";
import { DataSource, QueryFailedError } from "typeorm";
import {
  User,
  Workspace,
  WorkspaceMember,
  WorkspaceMemberRole,
} from "../../database/entities";
import type { AuthenticatedUser } from "../../common/interfaces/authenticated-user.interface";
import { AuditService } from "../audit/audit.service";
import { SessionsService } from "../sessions/sessions.service";
import { UsersService } from "../users/users.service";
import { LoginDto } from "./dto/login.dto";
import { RefreshTokenDto } from "./dto/refresh-token.dto";
import { SignupDto } from "./dto/signup.dto";

const BCRYPT_ROUNDS = 12;
const PG_UNIQUE_VIOLATION = "23505";

export interface PublicUser {
  id: string;
  name: string;
  email: string;
}

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
}

interface AccessTokenPayload {
  sub: string;
  email: string;
}

@Injectable()
export class AuthService {
  constructor(
    private readonly dataSource: DataSource,
    private readonly jwtService: JwtService,
    private readonly usersService: UsersService,
    private readonly sessionsService: SessionsService,
    private readonly auditService: AuditService,
  ) {}

  /**
   * User + workspace + OWNER membership + session are created atomically —
   * a failure at any step leaves no partial account behind.
   */
  async signup(
    dto: SignupDto,
  ): Promise<
    AuthTokens & { user: PublicUser; workspace: { id: string; name: string } }
  > {
    const email = dto.email.toLowerCase();

    if (await this.usersService.findByEmail(email)) {
      throw new ConflictException("Email is already registered");
    }

    const passwordHash = await bcrypt.hash(dto.password, BCRYPT_ROUNDS);
    const refreshToken = this.sessionsService.generateRefreshToken();

    let user: User;
    let workspace: Workspace;
    try {
      ({ user, workspace } = await this.dataSource.transaction(
        async (manager) => {
          const userRepository = manager.getRepository(User);
          const createdUser = await userRepository.save(
            userRepository.create({ name: dto.name, email, passwordHash }),
          );

          const workspaceRepository = manager.getRepository(Workspace);
          const createdWorkspace = await workspaceRepository.save(
            workspaceRepository.create({ name: dto.workspaceName }),
          );

          const memberRepository = manager.getRepository(WorkspaceMember);
          await memberRepository.save(
            memberRepository.create({
              workspaceId: createdWorkspace.id,
              userId: createdUser.id,
              role: WorkspaceMemberRole.OWNER,
            }),
          );

          await this.sessionsService.createSession(
            createdUser.id,
            refreshToken,
            manager,
          );

          return { user: createdUser, workspace: createdWorkspace };
        },
      ));
    } catch (error) {
      // Concurrent signup with the same email slips past the pre-check and
      // hits the unique constraint instead.
      if (this.isUniqueViolation(error)) {
        throw new ConflictException("Email is already registered");
      }
      throw error;
    }

    const accessToken = await this.signAccessToken(user.id, user.email);
    this.auditService.record({
      workspaceId: workspace.id,
      actorUserId: user.id,
      resourceType: "auth",
      resourceId: user.id,
      action: "auth.signup",
      metadata: { email: user.email, workspaceName: workspace.name },
    });
    return {
      user: this.toPublicUser(user),
      workspace: { id: workspace.id, name: workspace.name },
      accessToken,
      refreshToken,
    };
  }

  async login(dto: LoginDto): Promise<AuthTokens & { user: PublicUser }> {
    const user = await this.usersService.findByEmailWithPassword(
      dto.email.toLowerCase(),
    );

    // Same error for unknown email and wrong password — no account probing.
    if (!user || !(await bcrypt.compare(dto.password, user.passwordHash))) {
      throw new UnauthorizedException("Invalid credentials");
    }
    if (!user.isActive) {
      throw new UnauthorizedException("Account is deactivated");
    }

    const refreshToken = this.sessionsService.generateRefreshToken();
    await this.sessionsService.createSession(user.id, refreshToken);
    const accessToken = await this.signAccessToken(user.id, user.email);

    this.auditService.record({
      workspaceId: null,
      actorUserId: user.id,
      resourceType: "auth",
      resourceId: user.id,
      action: "auth.login",
      metadata: { email: user.email },
    });
    return { user: this.toPublicUser(user), accessToken, refreshToken };
  }

  async refresh(dto: RefreshTokenDto): Promise<AuthTokens> {
    const session = await this.sessionsService.findValidByToken(
      dto.refreshToken,
    );
    if (!session) {
      throw new UnauthorizedException("Invalid or expired refresh token");
    }

    const user = await this.usersService.findById(session.userId);
    if (!user || !user.isActive) {
      throw new UnauthorizedException("Account is deactivated");
    }

    const refreshToken = await this.sessionsService.rotate(session);
    const accessToken = await this.signAccessToken(user.id, user.email);
    return { accessToken, refreshToken };
  }

  async logout(dto: RefreshTokenDto): Promise<void> {
    // Resolve the session before revoking so the audit row has an actor.
    const session = await this.sessionsService.findValidByToken(
      dto.refreshToken,
    );
    await this.sessionsService.revokeByToken(dto.refreshToken);
    if (session) {
      this.auditService.record({
        workspaceId: null,
        actorUserId: session.userId,
        resourceType: "auth",
        resourceId: session.userId,
        action: "auth.logout",
      });
    }
  }

  /**
   * Token verification for non-HTTP transports (Socket.IO handshake).
   * Same semantics as JwtStrategy.validate: signature + expiry, then the
   * user must still exist and be active. Returns null instead of throwing
   * so callers on other protocols map the failure themselves.
   */
  async verifyAccessToken(token: string): Promise<AuthenticatedUser | null> {
    try {
      const payload =
        await this.jwtService.verifyAsync<AccessTokenPayload>(token);
      const user = await this.usersService.findById(payload.sub);
      if (!user || !user.isActive) return null;
      return { id: user.id, email: user.email, name: user.name };
    } catch {
      return null;
    }
  }

  /**
   * Access token carries identity only (sub + email) — roles are resolved
   * from workspace_members per request, never baked into the JWT.
   */
  private async signAccessToken(
    userId: string,
    email: string,
  ): Promise<string> {
    return this.jwtService.signAsync({ sub: userId, email });
  }

  private toPublicUser(user: User): PublicUser {
    return { id: user.id, name: user.name, email: user.email };
  }

  private isUniqueViolation(error: unknown): boolean {
    return (
      error instanceof QueryFailedError &&
      (error.driverError as { code?: string }).code === PG_UNIQUE_VIOLATION
    );
  }
}
