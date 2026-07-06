import { Injectable, Logger } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { RequestContextService } from "../../common/request-context/request-context.service";
import { AuditLog } from "../../database/entities";

export interface AuditEntry {
  /** Defaults to the request's workspace; null for pre-workspace events. */
  workspaceId?: string | null;
  /** Defaults to the request's user; null marks a system event. */
  actorUserId?: string | null;
  resourceType: string;
  resourceId?: string | null;
  action: string;
  metadata?: Record<string, unknown>;
}

export interface AuditListQuery {
  resourceType?: string;
  actorUserId?: string;
  page: number;
  limit: number;
}

/**
 * The single write path for the audit trail. Correlation fields
 * (actor, workspace, ip, user agent, request id) come from the ambient
 * request context, so call sites state only the business fact. Writes
 * are fire-and-forget: an audit failure must never fail the action it
 * describes.
 */
@Injectable()
export class AuditService {
  private readonly logger = new Logger(AuditService.name);

  constructor(
    @InjectRepository(AuditLog)
    private readonly auditRepository: Repository<AuditLog>,
    private readonly requestContext: RequestContextService,
  ) {}

  record(entry: AuditEntry): void {
    const context = this.requestContext.get();
    const row = this.auditRepository.create({
      workspaceId: entry.workspaceId ?? context?.workspaceId ?? null,
      actorUserId:
        entry.actorUserId !== undefined
          ? entry.actorUserId
          : (context?.userId ?? null),
      resourceType: entry.resourceType,
      resourceId: entry.resourceId ?? null,
      action: entry.action,
      metadata: {
        ...(entry.metadata ?? {}),
        ...(context?.requestId ? { requestId: context.requestId } : {}),
      },
      ipAddress: context?.ipAddress ?? null,
      userAgent: context?.userAgent ?? null,
    });

    this.auditRepository.save(row).catch((error: unknown) => {
      this.logger.error(
        `failed to write audit event ${entry.action}: ${
          error instanceof Error ? error.message : "unknown error"
        }`,
      );
    });
  }

  async list(
    workspaceId: string,
    query: AuditListQuery,
  ): Promise<{ data: AuditLog[]; total: number }> {
    const qb = this.auditRepository
      .createQueryBuilder("a")
      .leftJoinAndSelect("a.actorUser", "actor")
      .where("a.workspace_id = :workspaceId", { workspaceId })
      .orderBy("a.created_at", "DESC")
      .offset((query.page - 1) * query.limit)
      .limit(query.limit);

    if (query.resourceType) {
      qb.andWhere("a.resource_type = :resourceType", {
        resourceType: query.resourceType,
      });
    }
    if (query.actorUserId) {
      qb.andWhere("a.actor_user_id = :actorUserId", {
        actorUserId: query.actorUserId,
      });
    }

    const [data, total] = await qb.getManyAndCount();
    return { data, total };
  }

  /** Chronological events for one resource — the timeline's event half. */
  async listForResource(
    workspaceId: string,
    resourceType: string,
    resourceId: string,
  ): Promise<AuditLog[]> {
    return this.auditRepository.find({
      where: { workspaceId, resourceType, resourceId },
      relations: { actorUser: true },
      order: { createdAt: "ASC" },
      take: 200,
    });
  }
}
