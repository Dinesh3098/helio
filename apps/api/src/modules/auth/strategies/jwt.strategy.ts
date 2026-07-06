import { Injectable, UnauthorizedException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { PassportStrategy } from "@nestjs/passport";
import { ExtractJwt, Strategy } from "passport-jwt";
import { AuthenticatedUser } from "../../../common/interfaces/authenticated-user.interface";
import { AppConfig } from "../../../config/configuration";
import { UsersService } from "../../users/users.service";

interface AccessTokenPayload {
  sub: string;
  email: string;
}

/**
 * Verifies the bearer token signature/expiry, then confirms the user still
 * exists and is active — a deactivated account is locked out within one
 * access-token lifetime at most, and immediately for new tokens.
 */
@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    config: ConfigService<AppConfig, true>,
    private readonly usersService: UsersService,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: config.get("jwt.secret", { infer: true }),
    });
  }

  async validate(payload: AccessTokenPayload): Promise<AuthenticatedUser> {
    const user = await this.usersService.findById(payload.sub);
    if (!user || !user.isActive) {
      throw new UnauthorizedException();
    }
    return { id: user.id, email: user.email, name: user.name };
  }
}
