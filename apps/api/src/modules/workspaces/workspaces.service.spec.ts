import { NotFoundException } from "@nestjs/common";
import { Repository } from "typeorm";
import { Workspace } from "../../database/entities";
import { AuditService } from "../audit/audit.service";
import {
  createMockRepository,
  MockRepository,
} from "../../../test/helpers/unit";
import { WorkspacesService } from "./workspaces.service";

describe("WorkspacesService", () => {
  let repository: MockRepository;
  let auditService: { record: jest.Mock };
  let service: WorkspacesService;

  const workspace = {
    id: "ws-1",
    name: "Acme",
    createdAt: new Date("2026-01-01T00:00:00Z"),
    updatedAt: new Date("2026-01-02T00:00:00Z"),
  } as Workspace;

  beforeEach(() => {
    repository = createMockRepository();
    auditService = { record: jest.fn() };
    service = new WorkspacesService(
      repository as unknown as Repository<Workspace>,
      auditService as unknown as AuditService,
    );
  });

  describe("getById", () => {
    it("returns the workspace as a response DTO", async () => {
      repository.findOne.mockResolvedValue({ ...workspace });

      await expect(service.getById("ws-1")).resolves.toEqual({
        id: "ws-1",
        name: "Acme",
        createdAt: workspace.createdAt,
        updatedAt: workspace.updatedAt,
      });
      expect(repository.findOne).toHaveBeenCalledWith({
        where: { id: "ws-1" },
      });
    });

    it("throws 404 for an unknown workspace", async () => {
      repository.findOne.mockResolvedValue(null);

      await expect(service.getById("missing")).rejects.toThrow(
        new NotFoundException("Workspace not found"),
      );
    });
  });

  describe("updateName", () => {
    it("renames the workspace and records an audit entry with from/to", async () => {
      repository.findOne.mockResolvedValue({ ...workspace });

      const result = await service.updateName("ws-1", { name: "Acme Corp" });

      expect(repository.save).toHaveBeenCalledWith(
        expect.objectContaining({ id: "ws-1", name: "Acme Corp" }),
      );
      expect(auditService.record).toHaveBeenCalledWith({
        workspaceId: "ws-1",
        resourceType: "workspace",
        resourceId: "ws-1",
        action: "workspace.updated",
        metadata: { from: "Acme", to: "Acme Corp" },
      });
      expect(result.name).toBe("Acme Corp");
    });

    it("skips the audit entry when the name is unchanged", async () => {
      repository.findOne.mockResolvedValue({ ...workspace });

      const result = await service.updateName("ws-1", { name: "Acme" });

      expect(auditService.record).not.toHaveBeenCalled();
      expect(repository.save).toHaveBeenCalledTimes(1);
      expect(result.name).toBe("Acme");
    });

    it("throws 404 for an unknown workspace without saving", async () => {
      repository.findOne.mockResolvedValue(null);

      await expect(
        service.updateName("missing", { name: "New" }),
      ).rejects.toBeInstanceOf(NotFoundException);
      expect(repository.save).not.toHaveBeenCalled();
      expect(auditService.record).not.toHaveBeenCalled();
    });
  });
});
