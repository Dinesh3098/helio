import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import {
  AutomationExecution,
  AutomationExecutionStatus,
  AutomationRule,
  Conversation,
} from '../../database/entities';
import {
  ConversationEvent,
  ConversationEventsService,
} from '../../events/conversation-events.service';
import { AutomationEvaluator } from './automation-evaluator.service';
import { AutomationExecutor } from './automation-executor.service';
import {
  AutomationAction,
  AutomationCondition,
} from './automation.types';

export interface RuleRunResult {
  matched: boolean;
  executionId?: string;
  status?: AutomationExecutionStatus;
  error?: string | null;
}

/**
 * The engine: receives conversation events from the bus, finds matching
 * enabled rules, and runs them sequentially. Every matched run is logged
 * as an AutomationExecution. Recursion cannot happen — action side
 * effects emit inside the bus's suppression scope and are dropped.
 */
@Injectable()
export class AutomationEngineService implements OnModuleInit {
  private readonly logger = new Logger(AutomationEngineService.name);

  constructor(
    @InjectRepository(AutomationRule)
    private readonly rulesRepository: Repository<AutomationRule>,
    @InjectRepository(AutomationExecution)
    private readonly executionsRepository: Repository<AutomationExecution>,
    @InjectRepository(Conversation)
    private readonly conversationsRepository: Repository<Conversation>,
    private readonly conversationEvents: ConversationEventsService,
    private readonly evaluator: AutomationEvaluator,
    private readonly executor: AutomationExecutor,
  ) {}

  onModuleInit(): void {
    this.conversationEvents.setHandler((event) => this.handleEvent(event));
  }

  async handleEvent(event: ConversationEvent): Promise<void> {
    const rules = await this.rulesRepository.find({
      where: {
        workspaceId: event.workspaceId,
        enabled: true,
        trigger: event.trigger,
      },
      // Deterministic order: oldest rule first.
      order: { createdAt: 'ASC' },
    });
    if (rules.length === 0) return;

    for (const rule of rules) {
      // Reload per rule — an earlier rule may have changed status,
      // priority, or assignee, and later conditions must see that.
      const conversation = await this.conversationsRepository.findOne({
        where: { id: event.conversationId, workspaceId: event.workspaceId },
        relations: { contact: true },
      });
      if (!conversation) return;

      await this.runRule(rule, conversation, event.message);
    }
  }

  /** Shared by live events and the dashboard's "test rule" button. */
  async runRule(
    rule: AutomationRule,
    conversation: Conversation,
    message?: ConversationEvent['message'],
  ): Promise<RuleRunResult> {
    const matched = this.evaluator.matches(
      // Validated at write time; jsonb round-trips the same shape.
      rule.conditions as AutomationCondition[],
      { conversation, message, now: new Date() },
    );
    if (!matched) return { matched: false };

    const startedAt = new Date();
    let status = AutomationExecutionStatus.SUCCESS;
    let error: string | null = null;

    try {
      await this.conversationEvents.runSuppressed(async () => {
        for (const action of rule.actions as AutomationAction[]) {
          await this.executor.execute(
            rule.workspaceId,
            conversation.id,
            action,
          );
        }
      });
    } catch (caught) {
      status = AutomationExecutionStatus.FAILED;
      error =
        caught instanceof Error ? caught.message : 'Unknown execution error';
      this.logger.warn(
        `rule "${rule.name}" (${rule.id}) failed on conversation ${conversation.id}: ${error}`,
      );
    }

    const execution = await this.executionsRepository.save(
      this.executionsRepository.create({
        ruleId: rule.id,
        conversationId: conversation.id,
        status,
        error,
        startedAt,
        finishedAt: new Date(),
      }),
    );
    return { matched: true, executionId: execution.id, status, error };
  }
}
