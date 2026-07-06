import { Logger } from "@nestjs/common";
import { Repository } from "typeorm";
import {
  RequestContext,
  RequestContextService,
} from "../../common/request-context/request-context.service";
import { AuditLog } from "../../database/entities";
import { createMockRepository } from "../../../test/helpers/unit";
import { AuditService } from "./audit.service";

const createMockQueryBuilder = () => {
  const qb: Record<string, jest.Mock> = {};
  for (const method of [
    "leftJoinAndSelect",
    "where",
    "andWhere",
    "orderBy",
    "offset",
    "limit",
  ]) {
    qb[method] = jest.fn().mockImplementation(() => qb);
  }
  qb.getManyAndCount = jest.fn();
  return qb;
};

describe("AuditService", () => {
  let repository: ReturnType<typeof createMockRepository>;
  let requestContext: { get: jest.Mock };
  let service: AuditService;

  const httpContext: RequestContext = {
    requestId: "req-42",
    ipAddress: "10.0.0.1",
    userAgent: "jest/1.0",
    userId: "user-1",
    workspaceId: "ws-1",
  };

  beforeEach(() => {
    repository = createMockRepository();
    requestContext = { get: jest.fn().mockReturnValue(httpContext) };
    service = new AuditService(
      repository as unknown as Repository<AuditLog>,
      requestContext as unknown as RequestContextService,
    );
  });

  afterEach(() => jest.restoreAllMocks());

  describe("record", () => {
    it("fills actor, workspace, and correlation fields from the request context", () => {
      service.record({
        resourceType: "kb_article",
        resourceId: "art-1",
        action: "kb.article_created",
        metadata: { title: "Hello" },
      });

      expect(repository.create).toHaveBeenCalledWith({
        workspaceId: "ws-1",
        actorUserId: "user-1",
        resourceType: "kb_article",
        resourceId: "art-1",
        action: "kb.article_created",
        metadata: { title: "Hello", requestId: "req-42" },
        ipAddress: "10.0.0.1",
        userAgent: "jest/1.0",
      });
      expect(repository.save).toHaveBeenCalledTimes(1);
    });

    it("lets explicit workspaceId and a null actor override the context", () => {
      service.record({
        workspaceId: "ws-other",
        actorUserId: null, // system event
        resourceType: "email_account",
        action: "email_account.created",
      });

      expect(repository.create).toHaveBeenCalledWith(
        expect.objectContaining({
          workspaceId: "ws-other",
          actorUserId: null,
        }),
      );
    });

    it("records nulls when running outside any request context", () => {
      requestContext.get.mockReturnValue(undefined);

      service.record({ resourceType: "conversation", action: "auto.assign" });

      expect(repository.create).toHaveBeenCalledWith({
        workspaceId: null,
        actorUserId: null,
        resourceType: "conversation",
        resourceId: null,
        action: "auto.assign",
        metadata: {},
        ipAddress: null,
        userAgent: null,
      });
    });

    it("never throws when the write fails — the failure is only logged", async () => {
      const errorLog = jest
        .spyOn(Logger.prototype, "error")
        .mockImplementation(() => undefined);
      repository.save.mockRejectedValueOnce(new Error("db down"));

      expect(() =>
        service.record({ resourceType: "x", action: "y" }),
      ).not.toThrow();

      // Flush the fire-and-forget promise.
      await new Promise((resolve) => setImmediate(resolve));
      expect(errorLog).toHaveBeenCalledWith(
        expect.stringContaining("failed to write audit event y"),
      );
    });
  });

  describe("list", () => {
    it("scopes to the workspace, paginates, and orders newest first", async () => {
      const qb = createMockQueryBuilder();
      qb.getManyAndCount!.mockResolvedValue([[{ id: "log-1" }], 7]);
      repository.createQueryBuilder.mockReturnValue(qb);

      const result = await service.list("ws-1", { page: 3, limit: 10 });

      expect(qb.where).toHaveBeenCalledWith("a.workspace_id = :workspaceId", {
        workspaceId: "ws-1",
      });
      expect(qb.orderBy).toHaveBeenCalledWith("a.created_at", "DESC");
      expect(qb.offset).toHaveBeenCalledWith(20);
      expect(qb.limit).toHaveBeenCalledWith(10);
      expect(qb.andWhere).not.toHaveBeenCalled();
      expect(result).toEqual({ data: [{ id: "log-1" }], total: 7 });
    });

    it("applies resourceType and actor filters only when given", async () => {
      const qb = createMockQueryBuilder();
      qb.getManyAndCount!.mockResolvedValue([[], 0]);
      repository.createQueryBuilder.mockReturnValue(qb);

      await service.list("ws-1", {
        page: 1,
        limit: 20,
        resourceType: "kb_article",
        actorUserId: "user-9",
      });

      expect(qb.andWhere).toHaveBeenCalledWith(
        "a.resource_type = :resourceType",
        { resourceType: "kb_article" },
      );
      expect(qb.andWhere).toHaveBeenCalledWith(
        "a.actor_user_id = :actorUserId",
        { actorUserId: "user-9" },
      );
    });
  });

  describe("listForResource", () => {
    it("returns the capped chronological trail for one resource", async () => {
      const rows = [{ id: "log-1" }];
      repository.find.mockResolvedValue(rows);

      const result = await service.listForResource(
        "ws-1",
        "conversation",
        "conv-1",
      );

      expect(repository.find).toHaveBeenCalledWith({
        where: {
          workspaceId: "ws-1",
          resourceType: "conversation",
          resourceId: "conv-1",
        },
        relations: { actorUser: true },
        order: { createdAt: "ASC" },
        take: 200,
      });
      expect(result).toBe(rows);
    });
  });
});
