import { Injectable, NotFoundException } from '@nestjs/common';
import { AiService } from '../ai/ai.service';
import { RealtimeEmitterService } from '../../realtime/realtime-emitter.service';
import { SERVER_EVENTS } from '../../realtime/realtime.events';
import { ConversationsService } from '../conversations/conversations.service';
import { MessagesService } from '../messages/messages.service';
import { WorkspaceMembersService } from '../workspace-members/workspace-members.service';
import { AutomationAction } from './automation.types';

/**
 * Executes one action by delegating to the owning service — the executor
 * itself contains no business logic. Callers wrap execution in the event
 * bus's suppression scope, so nothing here can re-trigger rules.
 */
@Injectable()
export class AutomationExecutor {
  constructor(
    private readonly conversationsService: ConversationsService,
    private readonly messagesService: MessagesService,
    private readonly aiService: AiService,
    private readonly workspaceMembersService: WorkspaceMembersService,
    private readonly realtimeEmitter: RealtimeEmitterService,
  ) {}

  async execute(
    workspaceId: string,
    conversationId: string,
    action: AutomationAction,
  ): Promise<void> {
    switch (action.type) {
      case 'assign': {
        // The target may have left the workspace since the rule was made.
        const membership = await this.workspaceMembersService.findMembership(
          workspaceId,
          action.userId,
        );
        if (!membership) {
          throw new NotFoundException(
            'Assignee is no longer a member of this workspace',
          );
        }
        await this.conversationsService.systemAssign(
          workspaceId,
          conversationId,
          action.userId,
        );
        return;
      }
      case 'setPriority':
        await this.conversationsService.update(workspaceId, conversationId, {
          priority: action.priority,
        });
        return;
      case 'setStatus':
        await this.conversationsService.update(workspaceId, conversationId, {
          status: action.status,
        });
        return;
      case 'aiSummary':
        await this.aiService.generateSummary(workspaceId, conversationId);
        return;
      case 'aiReply': {
        const text = await this.aiService.suggestReply(
          workspaceId,
          conversationId,
          // Synthetic author identity for the prompt only.
          { id: '', name: 'the support team', email: '' },
          action.instructions,
        );
        await this.sendReply(workspaceId, conversationId, text);
        return;
      }
      case 'autoReply':
        await this.sendReply(workspaceId, conversationId, action.content);
        return;
      case 'addTag':
        await this.conversationsService.systemTag(
          workspaceId,
          conversationId,
          action.tag,
        );
        return;
      case 'removeTag':
        await this.conversationsService.systemTag(
          workspaceId,
          conversationId,
          action.tag,
          true,
        );
        return;
    }
  }

  /** Persist via the shared message core, then fan out to the room. */
  private async sendReply(
    workspaceId: string,
    conversationId: string,
    content: string,
  ): Promise<void> {
    const message = await this.messagesService.createAutomationMessage(
      workspaceId,
      conversationId,
      content,
    );
    this.realtimeEmitter.emitToConversation(
      conversationId,
      SERVER_EVENTS.messageCreated,
      message,
    );
  }
}
