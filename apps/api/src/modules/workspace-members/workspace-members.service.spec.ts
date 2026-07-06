import {
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from "@nestjs/common";
import { Repository } from "typeorm";
import {
  User,
  WorkspaceMember,
  WorkspaceMemberRole,
} from "../../database/entities";
import { AuditService } from "../audit/audit.service";
import { UsersService } from "../users/users.service";
import {
  createMockRepository,
  MockRepository,
} from "../../../test/helpers/unit";
import { WorkspaceMembersService } from "./workspace-members.service";

describe("WorkspaceMembersService", () => {
  let repository: MockRepository;
  let usersService: { findByEmail: jest.Mock };
  let auditService: { record: jest.Mock };
  let service: WorkspaceMembersService;

  const owner = {
    id: "member-owner",
    workspaceId: "ws-1",
    userId: "user-owner",
    role: WorkspaceMemberRole.OWNER,
  } as WorkspaceMember;

  const admin = {
    id: "member-admin",
    workspaceId: "ws-1",
    userId: "user-admin",
    role: WorkspaceMemberRole.ADMIN,
  } as WorkspaceMember;

  const agentTarget = () =>
    ({
      id: "member-agent",
      workspaceId: "ws-1",
      userId: "user-agent",
      role: WorkspaceMemberRole.AGENT,
      createdAt: new Date("2026-02-01T00:00:00Z"),
      user: {
        id: "user-agent",
        name: "Agent Smith",
        email: "agent@example.com",
      } as User,
    }) as WorkspaceMember;

  beforeEach(() => {
    repository = createMockRepository();
    usersService = { findByEmail: jest.fn() };
    auditService = { record: jest.fn() };
    service = new WorkspaceMembersService(
      repository as unknown as Repository<WorkspaceMember>,
      usersService as unknown as UsersService,
      auditService as unknown as AuditService,
    );
  });

  describe("findMembership", () => {
    it("looks up by workspaceId + userId", async () => {
      repository.findOne.mockResolvedValue(owner);

      await expect(service.findMembership("ws-1", "user-owner")).resolves.toBe(
        owner,
      );
      expect(repository.findOne).toHaveBeenCalledWith({
        where: { workspaceId: "ws-1", userId: "user-owner" },
      });
    });

    it("returns null for a non-member", async () => {
      repository.findOne.mockResolvedValue(null);

      await expect(
        service.findMembership("ws-1", "stranger"),
      ).resolves.toBeNull();
    });
  });

  describe("findByUser", () => {
    it("fetches at most two memberships (only 'exactly one?' matters)", async () => {
      repository.find.mockResolvedValue([owner]);

      await expect(service.findByUser("user-owner")).resolves.toEqual([owner]);
      expect(repository.find).toHaveBeenCalledWith({
        where: { userId: "user-owner" },
        take: 2,
      });
    });
  });

  describe("listForUser", () => {
    it("maps memberships to workspace picker entries", async () => {
      repository.find.mockResolvedValue([
        {
          workspaceId: "ws-1",
          role: WorkspaceMemberRole.OWNER,
          workspace: { name: "Acme" },
        },
        {
          workspaceId: "ws-2",
          role: WorkspaceMemberRole.AGENT,
          workspace: { name: "Beta" },
        },
      ]);

      await expect(service.listForUser("user-1")).resolves.toEqual([
        { workspaceId: "ws-1", name: "Acme", role: WorkspaceMemberRole.OWNER },
        { workspaceId: "ws-2", name: "Beta", role: WorkspaceMemberRole.AGENT },
      ]);
    });
  });

  describe("listMembers", () => {
    it("returns members with user details as response DTOs", async () => {
      const member = agentTarget();
      repository.find.mockResolvedValue([member]);

      await expect(service.listMembers("ws-1")).resolves.toEqual([
        {
          id: "member-agent",
          userId: "user-agent",
          name: "Agent Smith",
          email: "agent@example.com",
          role: WorkspaceMemberRole.AGENT,
          joinedAt: member.createdAt,
        },
      ]);
      expect(repository.find).toHaveBeenCalledWith({
        where: { workspaceId: "ws-1" },
        relations: { user: true },
        order: { createdAt: "ASC" },
      });
    });
  });

  describe("invite", () => {
    const invitee = {
      id: "user-new",
      name: "Newbie",
      email: "new@example.com",
    } as User;

    it("creates a membership for an existing user and audits it", async () => {
      usersService.findByEmail.mockResolvedValue(invitee);
      repository.findOne.mockResolvedValue(null);
      const createdAt = new Date("2026-03-01T00:00:00Z");
      repository.save.mockImplementation(async (entity: unknown) => ({
        ...(entity as object),
        id: "member-new",
        createdAt,
      }));

      const result = await service.invite(owner, {
        email: "New@Example.com",
        role: WorkspaceMemberRole.AGENT,
      });

      expect(usersService.findByEmail).toHaveBeenCalledWith("new@example.com");
      expect(repository.create).toHaveBeenCalledWith({
        workspaceId: "ws-1",
        userId: "user-new",
        role: WorkspaceMemberRole.AGENT,
      });
      expect(result).toEqual({
        id: "member-new",
        userId: "user-new",
        name: "Newbie",
        email: "new@example.com",
        role: WorkspaceMemberRole.AGENT,
        joinedAt: createdAt,
      });
      expect(auditService.record).toHaveBeenCalledWith(
        expect.objectContaining({ action: "member.invited" }),
      );
    });

    it("forbids a non-owner from inviting admins", async () => {
      await expect(
        service.invite(admin, {
          email: "new@example.com",
          role: WorkspaceMemberRole.ADMIN,
        }),
      ).rejects.toThrow(
        new ForbiddenException("Only the owner can invite admins"),
      );
      expect(usersService.findByEmail).not.toHaveBeenCalled();
    });

    it("throws 404 when no user exists with the email", async () => {
      usersService.findByEmail.mockResolvedValue(null);

      await expect(
        service.invite(owner, {
          email: "ghost@example.com",
          role: WorkspaceMemberRole.AGENT,
        }),
      ).rejects.toBeInstanceOf(NotFoundException);
      expect(repository.save).not.toHaveBeenCalled();
    });

    it("throws 409 when the user is already a member", async () => {
      usersService.findByEmail.mockResolvedValue(invitee);
      repository.findOne.mockResolvedValue({ id: "member-existing" });

      await expect(
        service.invite(owner, {
          email: "new@example.com",
          role: WorkspaceMemberRole.AGENT,
        }),
      ).rejects.toBeInstanceOf(ConflictException);
      expect(repository.save).not.toHaveBeenCalled();
    });
  });

  describe("updateRole", () => {
    it("lets the owner promote an agent to admin and audits from/to", async () => {
      const target = agentTarget();
      repository.findOne.mockResolvedValue(target);

      const result = await service.updateRole(owner, "member-agent", {
        role: WorkspaceMemberRole.ADMIN,
      });

      expect(repository.findOne).toHaveBeenCalledWith({
        where: { id: "member-agent", workspaceId: "ws-1" },
        relations: { user: true },
      });
      expect(repository.save).toHaveBeenCalledWith(
        expect.objectContaining({ role: WorkspaceMemberRole.ADMIN }),
      );
      expect(auditService.record).toHaveBeenCalledWith(
        expect.objectContaining({
          action: "member.role_changed",
          metadata: {
            email: "agent@example.com",
            from: WorkspaceMemberRole.AGENT,
            to: WorkspaceMemberRole.ADMIN,
          },
        }),
      );
      expect(result.role).toBe(WorkspaceMemberRole.ADMIN);
    });

    it("is a no-op (no save, no audit) when the role is unchanged", async () => {
      repository.findOne.mockResolvedValue(agentTarget());

      const result = await service.updateRole(owner, "member-agent", {
        role: WorkspaceMemberRole.AGENT,
      });

      expect(repository.save).not.toHaveBeenCalled();
      expect(auditService.record).not.toHaveBeenCalled();
      expect(result.role).toBe(WorkspaceMemberRole.AGENT);
    });

    it("throws 404 for a member from another workspace or nonexistent id", async () => {
      repository.findOne.mockResolvedValue(null);

      await expect(
        service.updateRole(owner, "foreign-member", {
          role: WorkspaceMemberRole.ADMIN,
        }),
      ).rejects.toThrow(
        new NotFoundException("Member not found in this workspace"),
      );
    });

    it("protects the owner: the owner role can never be changed", async () => {
      repository.findOne.mockResolvedValue({
        ...agentTarget(),
        id: "member-owner",
        userId: "user-owner",
        role: WorkspaceMemberRole.OWNER,
      });

      await expect(
        service.updateRole(admin, "member-owner", {
          role: WorkspaceMemberRole.AGENT,
        }),
      ).rejects.toThrow(
        new ForbiddenException("The owner role cannot be changed"),
      );
      expect(repository.save).not.toHaveBeenCalled();
    });

    it("forbids changing your own role", async () => {
      repository.findOne.mockResolvedValue({
        ...agentTarget(),
        id: "member-admin",
        userId: "user-admin",
        role: WorkspaceMemberRole.ADMIN,
      });

      await expect(
        service.updateRole(admin, "member-admin", {
          role: WorkspaceMemberRole.AGENT,
        }),
      ).rejects.toThrow(
        new ForbiddenException("You cannot change your own role"),
      );
    });

    it("forbids admins from managing non-agents", async () => {
      repository.findOne.mockResolvedValue({
        ...agentTarget(),
        id: "member-admin-2",
        userId: "user-admin-2",
        role: WorkspaceMemberRole.ADMIN,
      });

      await expect(
        service.updateRole(admin, "member-admin-2", {
          role: WorkspaceMemberRole.AGENT,
        }),
      ).rejects.toThrow(
        new ForbiddenException("Admins can only manage agents"),
      );
    });

    it("forbids admins from promoting agents to admin", async () => {
      repository.findOne.mockResolvedValue(agentTarget());

      await expect(
        service.updateRole(admin, "member-agent", {
          role: WorkspaceMemberRole.ADMIN,
        }),
      ).rejects.toThrow(
        new ForbiddenException("Only the owner can promote to admin"),
      );
      expect(repository.save).not.toHaveBeenCalled();
    });
  });

  describe("remove", () => {
    it("removes a member and audits the removal", async () => {
      const target = agentTarget();
      repository.findOne.mockResolvedValue(target);
      repository.remove = jest.fn().mockResolvedValue(target);

      await service.remove(owner, "member-agent");

      expect(repository.remove).toHaveBeenCalledWith(target);
      expect(auditService.record).toHaveBeenCalledWith(
        expect.objectContaining({
          action: "member.removed",
          resourceId: "member-agent",
          metadata: {
            email: "agent@example.com",
            role: WorkspaceMemberRole.AGENT,
          },
        }),
      );
    });

    it("throws 404 when the member is not in the actor's workspace", async () => {
      repository.findOne.mockResolvedValue(null);

      await expect(service.remove(owner, "ghost")).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });

    it("protects the owner: the owner can never be removed", async () => {
      repository.findOne.mockResolvedValue({
        ...agentTarget(),
        id: "member-owner",
        userId: "user-owner",
        role: WorkspaceMemberRole.OWNER,
      });
      repository.remove = jest.fn();

      await expect(service.remove(admin, "member-owner")).rejects.toThrow(
        new ForbiddenException("The owner cannot be removed"),
      );
      expect(repository.remove).not.toHaveBeenCalled();
    });

    it("forbids removing yourself", async () => {
      repository.findOne.mockResolvedValue({
        ...agentTarget(),
        id: "member-admin",
        userId: "user-admin",
        role: WorkspaceMemberRole.ADMIN,
      });

      await expect(service.remove(admin, "member-admin")).rejects.toThrow(
        new ForbiddenException("You cannot remove yourself"),
      );
    });

    it("forbids admins from removing other admins", async () => {
      repository.findOne.mockResolvedValue({
        ...agentTarget(),
        id: "member-admin-2",
        userId: "user-admin-2",
        role: WorkspaceMemberRole.ADMIN,
      });
      repository.remove = jest.fn();

      await expect(service.remove(admin, "member-admin-2")).rejects.toThrow(
        new ForbiddenException("Admins can only remove agents"),
      );
      expect(repository.remove).not.toHaveBeenCalled();
    });
  });
});
