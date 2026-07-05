import {
  ConflictException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import bcrypt from 'bcrypt';
import { DataSource, QueryFailedError } from 'typeorm';
import {
  User,
  Workspace,
  WorkspaceMember,
  WorkspaceMemberRole,
} from '../../database/entities';
import { SessionsService } from '../sessions/sessions.service';
import { UsersService } from '../users/users.service';
import { LoginDto } from './dto/login.dto';
import { RefreshTokenDto } from './dto/refresh-token.dto';
import { SignupDto } from './dto/signup.dto';

const BCRYPT_ROUNDS = 12;
const PG_UNIQUE_VIOLATION = '23505';

export interface PublicUser {
  id: string;
  name: string;
  email: string;
}

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
}

@Injectable()
export class AuthService {
  constructor(
    private readonly dataSource: DataSource,
    private readonly jwtService: JwtService,
    private readonly usersService: UsersService,
    private readonly sessionsService: SessionsService,
  ) {}

  /**
   * User + workspace + OWNER membership + session are created atomically —
   * a failure at any step leaves no partial account behind.
   */
  async signup(dto: SignupDto): Promise<
    AuthTokens & { user: PublicUser; workspace: { id: string; name: string } }
  > {
    const email = dto.email.toLowerCase();

    if (await this.usersService.findByEmail(email)) {
      throw new ConflictException('Email is already registered');
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
        throw new ConflictException('Email is already registered');
      }
      throw error;
    }

    const accessToken = await this.signAccessToken(user.id, user.email);
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
      throw new UnauthorizedException('Invalid credentials');
    }
    if (!user.isActive) {
      throw new UnauthorizedException('Account is deactivated');
    }

    const refreshToken = this.sessionsService.generateRefreshToken();
    await this.sessionsService.createSession(user.id, refreshToken);
    const accessToken = await this.signAccessToken(user.id, user.email);

    return { user: this.toPublicUser(user), accessToken, refreshToken };
  }

  async refresh(dto: RefreshTokenDto): Promise<AuthTokens> {
    const session = await this.sessionsService.findValidByToken(
      dto.refreshToken,
    );
    if (!session) {
      throw new UnauthorizedException('Invalid or expired refresh token');
    }

    const user = await this.usersService.findById(session.userId);
    if (!user || !user.isActive) {
      throw new UnauthorizedException('Account is deactivated');
    }

    const refreshToken = await this.sessionsService.rotate(session);
    const accessToken = await this.signAccessToken(user.id, user.email);
    return { accessToken, refreshToken };
  }

  async logout(dto: RefreshTokenDto): Promise<void> {
    await this.sessionsService.revokeByToken(dto.refreshToken);
  }

  /**
   * Access token carries identity only (sub + email) — roles are resolved
   * from workspace_members per request, never baked into the JWT.
   */
  private async signAccessToken(userId: string, email: string): Promise<string> {
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
