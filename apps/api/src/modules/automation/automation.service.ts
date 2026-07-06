import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import type { AuthenticatedUser } from '../../common/interfaces/authenticated-user.interface';
import {
  AutomationExecution,
  AutomationRule,
  Conversation,
} from '../../database/entities';
import { AutomationEngineService } from './automation-engine.service';
import { validateActions, validateConditions } from './automation.types';
import {
  CreateRuleDto,
  ExecutionResponseDto,
  PaginatedExecutionsDto,
  QueryHistoryDto,
  RuleResponseDto,
  TestRuleResultDto,
  UpdateRuleDto,
} from './dto/automation.dto';

/** Rule CRUD, history, and the dashboard's test runner. */
@Injectable()
export class AutomationService {
  constructor(
    @InjectRepository(AutomationRule)
    private readonly rulesRepository: Repository<AutomationRule>,
    @InjectRepository(AutomationExecution)
    private readonly executionsRepository: Repository<AutomationExecution>,
    @InjectRepository(Conversation)
    private readonly conversationsRepository: Repository<Conversation>,
    private readonly engine: AutomationEngineService,
  ) {}

  async list(workspaceId: string): Promise<RuleResponseDto[]> {
    const rules = await this.rulesRepository.find({
      where: { workspaceId },
      relations: { createdByUser: true },
      order: { createdAt: 'ASC' },
    });
    return rules.map((rule) => this.toResponse(rule));
  }

  async create(
    workspaceId: string,
    author: AuthenticatedUser,
    dto: CreateRuleDto,
  ): Promise<RuleResponseDto> {
    const rule = await this.rulesRepository.save(
      this.rulesRepository.create({
        workspaceId,
        name: dto.name,
        trigger: dto.trigger,
        enabled: dto.enabled ?? true,
        conditions: validateConditions(dto.conditions ?? []),
        actions: validateActions(dto.actions),
        createdByUserId: author.id,
      }),
    );
    return this.getOne(workspaceId, rule.id);
  }

  async update(
    workspaceId: string,
    ruleId: string,
    dto: UpdateRuleDto,
  ): Promise<RuleResponseDto> {
    const rule = await this.findInWorkspace(workspaceId, ruleId);

    if (dto.name !== undefined) rule.name = dto.name;
    if (dto.trigger !== undefined) rule.trigger = dto.trigger;
    if (dto.enabled !== undefined) rule.enabled = dto.enabled;
    if (dto.conditions !== undefined) {
      rule.conditions = validateConditions(dto.conditions);
    }
    if (dto.actions !== undefined) {
      rule.actions = validateActions(dto.actions);
    }

    await this.rulesRepository.save(rule);
    return this.getOne(workspaceId, rule.id);
  }

  async remove(workspaceId: string, ruleId: string): Promise<void> {
    const rule = await this.findInWorkspace(workspaceId, ruleId);
    await this.rulesRepository.remove(rule);
  }

  /** Runs a rule against a real conversation, ignoring `enabled`. */
  async test(
    workspaceId: string,
    ruleId: string,
    conversationId: string,
  ): Promise<TestRuleResultDto> {
    const rule = await this.findInWorkspace(workspaceId, ruleId);
    const conversation = await this.conversationsRepository.findOne({
      where: { id: conversationId, workspaceId },
      relations: { contact: true },
    });
    if (!conversation) {
      throw new NotFoundException('Conversation not found');
    }
    return this.engine.runRule(rule, conversation);
  }

  async history(
    workspaceId: string,
    query: QueryHistoryDto,
  ): Promise<PaginatedExecutionsDto> {
    const qb = this.executionsRepository
      .createQueryBuilder('e')
      .innerJoinAndSelect('e.rule', 'rule')
      .leftJoinAndSelect('e.conversation', 'conversation')
      .leftJoinAndSelect('conversation.contact', 'contact')
      .where('rule.workspace_id = :workspaceId', { workspaceId })
      .orderBy('e.started_at', 'DESC')
      .offset(query.skip)
      .limit(query.limit);

    if (query.ruleId) {
      qb.andWhere('e.rule_id = :ruleId', { ruleId: query.ruleId });
    }

    const [executions, total] = await qb.getManyAndCount();
    return {
      data: executions.map((execution) => this.toExecutionResponse(execution)),
      total,
      page: query.page,
      limit: query.limit,
    };
  }

  private async getOne(
    workspaceId: string,
    ruleId: string,
  ): Promise<RuleResponseDto> {
    const rule = await this.rulesRepository.findOne({
      where: { id: ruleId, workspaceId },
      relations: { createdByUser: true },
    });
    if (!rule) {
      throw new NotFoundException('Automation rule not found');
    }
    return this.toResponse(rule);
  }

  private async findInWorkspace(
    workspaceId: string,
    ruleId: string,
  ): Promise<AutomationRule> {
    const rule = await this.rulesRepository.findOne({
      where: { id: ruleId, workspaceId },
    });
    if (!rule) {
      throw new NotFoundException('Automation rule not found');
    }
    return rule;
  }

  private toResponse(rule: AutomationRule): RuleResponseDto {
    return {
      id: rule.id,
      name: rule.name,
      enabled: rule.enabled,
      trigger: rule.trigger,
      conditions: rule.conditions,
      actions: rule.actions,
      createdByName: rule.createdByUser?.name ?? null,
      createdAt: rule.createdAt,
      updatedAt: rule.updatedAt,
    };
  }

  private toExecutionResponse(
    execution: AutomationExecution,
  ): ExecutionResponseDto {
    return {
      id: execution.id,
      ruleId: execution.ruleId,
      ruleName: execution.rule.name,
      conversationId: execution.conversationId,
      contactName: execution.conversation?.contact?.name ?? 'Unknown',
      status: execution.status,
      error: execution.error,
      startedAt: execution.startedAt,
      finishedAt: execution.finishedAt,
    };
  }
}
