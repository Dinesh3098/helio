import { ConflictException, UnauthorizedException } from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import bcrypt from "bcrypt";
import { DataSource, EntityManager, QueryFailedError } from "typeorm";
import {
  User,
  UserSession,
  Workspace,
  WorkspaceMemberRole,
} from "../../database/entities";
import { AuditService } from "../audit/audit.service";
import { SessionsService } from "../sessions/sessions.service";
import { UsersService } from "../users/users.service";
import { createMockRepository } from "../../../test/helpers/unit";
import { AuthService } from "./auth.service";

jest.mock("bcrypt", () => ({
  hash: jest.fn(),
  compare: jest.fn(),
}));

const mockedBcrypt = bcrypt as unknown as {
  hash: jest.Mock;
  compare: jest.Mock;
};

describe("AuthService", () => {
  let service: AuthService;
  let dataSource: { transaction: jest.Mock };
  let jwtService: { signAsync: jest.Mock; verifyAsync: jest.Mock };
  let usersService: {
    findById: jest.Mock;
    findByEmail: jest.Mock;
    findByEmailWithPassword: jest.Mock;
  };
  let sessionsService: {
    generateRefreshToken: jest.Mock;
    createSession: jest.Mock;
    findValidByToken: jest.Mock;
    rotate: jest.Mock;
    revokeByToken: jest.Mock;
  };
  let auditService: { record: jest.Mock };

  let userRepository: ReturnType<typeof createMockRepository>;
  let workspaceRepository: ReturnType<typeof createMockRepository>;
  let memberRepository: ReturnType<typeof createMockRepository>;
  let manager: { getRepository: jest.Mock };

  const activeUser = {
    id: "user-1",
    name: "Ada",
    email: "ada@example.com",
    passwordHash: "stored-hash",
    isActive: true,
  } as User;

  beforeEach(() => {
    jest.clearAllMocks();

    userRepository = createMockRepository();
    userRepository.save.mockImplementation(async (entity: unknown) => ({
      id: "user-1",
      ...(entity as object),
    }));
    workspaceRepository = createMockRepository();
    workspaceRepository.save.mockImplementation(async (entity: unknown) => ({
      id: "ws-1",
      ...(entity as object),
    }));
    memberRepository = createMockRepository();

    manager = {
      getRepository: jest.fn((entity: unknown) => {
        if (entity === User) return userRepository;
        if (entity === Workspace) return workspaceRepository;
        return memberRepository;
      }),
    };

    dataSource = {
      transaction: jest.fn(async (cb: (m: EntityManager) => unknown) =>
        cb(manager as unknown as EntityManager),
      ),
    };
    jwtService = {
      signAsync: jest.fn().mockResolvedValue("access-token"),
      verifyAsync: jest.fn(),
    };
    usersService = {
      findById: jest.fn(),
      findByEmail: jest.fn(),
      findByEmailWithPassword: jest.fn(),
    };
    sessionsService = {
      generateRefreshToken: jest.fn().mockReturnValue("refresh-token"),
      createSession: jest.fn().mockResolvedValue({ id: "sess-1" }),
      findValidByToken: jest.fn(),
      rotate: jest.fn(),
      revokeByToken: jest.fn().mockResolvedValue(undefined),
    };
    auditService = { record: jest.fn() };

    service = new AuthService(
      dataSource as unknown as DataSource,
      jwtService as unknown as JwtService,
      usersService as unknown as UsersService,
      sessionsService as unknown as SessionsService,
      auditService as unknown as AuditService,
    );
  });

  describe("signup", () => {
    const dto = {
      name: "Ada",
      email: "Ada@Example.com",
      password: "s3cret-pass",
      workspaceName: "Acme",
    };

    beforeEach(() => {
      usersService.findByEmail.mockResolvedValue(null);
      mockedBcrypt.hash.mockResolvedValue("hashed-password");
    });

    it("hashes the password and creates user + workspace + owner membership + session atomically", async () => {
      const result = await service.signup(dto);

      expect(mockedBcrypt.hash).toHaveBeenCalledWith("s3cret-pass", 12);
      expect(usersService.findByEmail).toHaveBeenCalledWith("ada@example.com");
      expect(userRepository.create).toHaveBeenCalledWith({
        name: "Ada",
        email: "ada@example.com",
        passwordHash: "hashed-password",
      });
      expect(workspaceRepository.create).toHaveBeenCalledWith({
        name: "Acme",
      });
      expect(memberRepository.create).toHaveBeenCalledWith({
        workspaceId: "ws-1",
        userId: "user-1",
        role: WorkspaceMemberRole.OWNER,
      });
      // Session must be created inside the same transaction (manager passed through).
      expect(sessionsService.createSession).toHaveBeenCalledWith(
        "user-1",
        "refresh-token",
        manager,
      );
      expect(result).toEqual({
        user: { id: "user-1", name: "Ada", email: "ada@example.com" },
        workspace: { id: "ws-1", name: "Acme" },
        accessToken: "access-token",
        refreshToken: "refresh-token",
      });
      expect(jwtService.signAsync).toHaveBeenCalledWith({
        sub: "user-1",
        email: "ada@example.com",
      });
      expect(auditService.record).toHaveBeenCalledWith(
        expect.objectContaining({ action: "auth.signup", workspaceId: "ws-1" }),
      );
    });

    it("rejects an already registered email before opening a transaction", async () => {
      usersService.findByEmail.mockResolvedValue(activeUser);

      await expect(service.signup(dto)).rejects.toBeInstanceOf(
        ConflictException,
      );
      expect(dataSource.transaction).not.toHaveBeenCalled();
      expect(mockedBcrypt.hash).not.toHaveBeenCalled();
    });

    it("maps a concurrent unique-constraint violation to 409", async () => {
      dataSource.transaction.mockRejectedValue(
        new QueryFailedError(
          "INSERT INTO users ...",
          undefined,
          Object.assign(new Error("duplicate key"), { code: "23505" }),
        ),
      );

      await expect(service.signup(dto)).rejects.toBeInstanceOf(
        ConflictException,
      );
    });

    it("rethrows unrelated transaction failures", async () => {
      const boom = new Error("connection lost");
      dataSource.transaction.mockRejectedValue(boom);

      await expect(service.signup(dto)).rejects.toBe(boom);
    });
  });

  describe("login", () => {
    const dto = { email: "Ada@Example.com", password: "s3cret-pass" };

    it("returns tokens and the public user for valid credentials", async () => {
      usersService.findByEmailWithPassword.mockResolvedValue({ ...activeUser });
      mockedBcrypt.compare.mockResolvedValue(true);

      const result = await service.login(dto);

      expect(usersService.findByEmailWithPassword).toHaveBeenCalledWith(
        "ada@example.com",
      );
      expect(mockedBcrypt.compare).toHaveBeenCalledWith(
        "s3cret-pass",
        "stored-hash",
      );
      expect(sessionsService.createSession).toHaveBeenCalledWith(
        "user-1",
        "refresh-token",
      );
      expect(result).toEqual({
        user: { id: "user-1", name: "Ada", email: "ada@example.com" },
        accessToken: "access-token",
        refreshToken: "refresh-token",
      });
      expect(auditService.record).toHaveBeenCalledWith(
        expect.objectContaining({ action: "auth.login" }),
      );
    });

    it("throws 401 for an unknown email without comparing passwords", async () => {
      usersService.findByEmailWithPassword.mockResolvedValue(null);

      await expect(service.login(dto)).rejects.toThrow(
        new UnauthorizedException("Invalid credentials"),
      );
      expect(mockedBcrypt.compare).not.toHaveBeenCalled();
      expect(sessionsService.createSession).not.toHaveBeenCalled();
    });

    it("throws the same 401 for a wrong password (no account probing)", async () => {
      usersService.findByEmailWithPassword.mockResolvedValue({ ...activeUser });
      mockedBcrypt.compare.mockResolvedValue(false);

      await expect(service.login(dto)).rejects.toThrow(
        new UnauthorizedException("Invalid credentials"),
      );
      expect(sessionsService.createSession).not.toHaveBeenCalled();
    });

    it("rejects deactivated accounts even with the correct password", async () => {
      usersService.findByEmailWithPassword.mockResolvedValue({
        ...activeUser,
        isActive: false,
      });
      mockedBcrypt.compare.mockResolvedValue(true);

      await expect(service.login(dto)).rejects.toThrow(
        new UnauthorizedException("Account is deactivated"),
      );
      expect(sessionsService.createSession).not.toHaveBeenCalled();
    });
  });

  describe("refresh", () => {
    const dto = { refreshToken: "old-refresh" };
    const session = { id: "sess-1", userId: "user-1" } as UserSession;

    it("rotates the session and issues a new token pair", async () => {
      sessionsService.findValidByToken.mockResolvedValue(session);
      usersService.findById.mockResolvedValue({ ...activeUser });
      sessionsService.rotate.mockResolvedValue("new-refresh");

      await expect(service.refresh(dto)).resolves.toEqual({
        accessToken: "access-token",
        refreshToken: "new-refresh",
      });
      expect(sessionsService.findValidByToken).toHaveBeenCalledWith(
        "old-refresh",
      );
      expect(sessionsService.rotate).toHaveBeenCalledWith(session);
    });

    it("rejects a revoked or expired refresh token", async () => {
      sessionsService.findValidByToken.mockResolvedValue(null);

      await expect(service.refresh(dto)).rejects.toThrow(
        new UnauthorizedException("Invalid or expired refresh token"),
      );
      expect(sessionsService.rotate).not.toHaveBeenCalled();
    });

    it("rejects when the session's user no longer exists", async () => {
      sessionsService.findValidByToken.mockResolvedValue(session);
      usersService.findById.mockResolvedValue(null);

      await expect(service.refresh(dto)).rejects.toThrow(
        new UnauthorizedException("Account is deactivated"),
      );
      expect(sessionsService.rotate).not.toHaveBeenCalled();
    });

    it("rejects when the user was deactivated after the session was issued", async () => {
      sessionsService.findValidByToken.mockResolvedValue(session);
      usersService.findById.mockResolvedValue({
        ...activeUser,
        isActive: false,
      });

      await expect(service.refresh(dto)).rejects.toBeInstanceOf(
        UnauthorizedException,
      );
      expect(sessionsService.rotate).not.toHaveBeenCalled();
    });
  });

  describe("logout", () => {
    it("revokes the token and records an audit entry for a live session", async () => {
      sessionsService.findValidByToken.mockResolvedValue({
        id: "sess-1",
        userId: "user-1",
      } as UserSession);

      await service.logout({ refreshToken: "some-token" });

      expect(sessionsService.revokeByToken).toHaveBeenCalledWith("some-token");
      expect(auditService.record).toHaveBeenCalledWith(
        expect.objectContaining({
          action: "auth.logout",
          actorUserId: "user-1",
        }),
      );
    });

    it("still revokes (idempotently) but skips audit when the token is unknown", async () => {
      sessionsService.findValidByToken.mockResolvedValue(null);

      await service.logout({ refreshToken: "bogus" });

      expect(sessionsService.revokeByToken).toHaveBeenCalledWith("bogus");
      expect(auditService.record).not.toHaveBeenCalled();
    });
  });

  describe("verifyAccessToken", () => {
    it("returns the authenticated user for a valid token", async () => {
      jwtService.verifyAsync.mockResolvedValue({
        sub: "user-1",
        email: "ada@example.com",
      });
      usersService.findById.mockResolvedValue({ ...activeUser });

      await expect(service.verifyAccessToken("jwt")).resolves.toEqual({
        id: "user-1",
        email: "ada@example.com",
        name: "Ada",
      });
      expect(usersService.findById).toHaveBeenCalledWith("user-1");
    });

    it("returns null for an invalid or expired signature", async () => {
      jwtService.verifyAsync.mockRejectedValue(new Error("jwt expired"));

      await expect(service.verifyAccessToken("bad")).resolves.toBeNull();
    });

    it("returns null when the user no longer exists", async () => {
      jwtService.verifyAsync.mockResolvedValue({ sub: "ghost", email: "x@y" });
      usersService.findById.mockResolvedValue(null);

      await expect(service.verifyAccessToken("jwt")).resolves.toBeNull();
    });

    it("returns null when the user is deactivated", async () => {
      jwtService.verifyAsync.mockResolvedValue({
        sub: "user-1",
        email: "ada@example.com",
      });
      usersService.findById.mockResolvedValue({
        ...activeUser,
        isActive: false,
      });

      await expect(service.verifyAccessToken("jwt")).resolves.toBeNull();
    });
  });
});
