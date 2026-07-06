import { Injectable } from "@nestjs/common";
import { Conversation } from "../../database/entities";
import { MessageResponseDto } from "../messages/dto/message-response.dto";
import { AutomationCondition } from "./automation.types";

export interface EvaluationContext {
  /** Loaded with its contact relation. */
  conversation: Conversation;
  /** Present for message-triggered events. */
  message?: MessageResponseDto;
  now: Date;
}

/** Pure predicate logic — no I/O. All conditions must match (AND). */
@Injectable()
export class AutomationEvaluator {
  matches(
    conditions: AutomationCondition[],
    context: EvaluationContext,
  ): boolean {
    return conditions.every((condition) => this.matchesOne(condition, context));
  }

  private matchesOne(
    condition: AutomationCondition,
    context: EvaluationContext,
  ): boolean {
    const { conversation, message, now } = context;
    switch (condition.type) {
      case "channel":
        return conversation.channel === condition.value;
      case "status":
        return conversation.status === condition.value;
      case "priority":
        return conversation.priority === condition.value;
      case "emailDomain": {
        const email = conversation.contact?.email?.toLowerCase();
        return !!email && email.endsWith(`@${condition.value}`);
      }
      case "messageContains":
        // Only meaningful on message triggers; never matches otherwise.
        return (
          !!message &&
          message.content.toLowerCase().includes(condition.value.toLowerCase())
        );
      case "assignedTo":
        return conversation.assignedToUserId === condition.value;
      case "timeOfDay": {
        // UTC by design — workspaces have no timezone setting yet, and a
        // server-local comparison would silently change per deployment.
        const minutes = now.getUTCHours() * 60 + now.getUTCMinutes();
        const from = this.toMinutes(condition.from);
        const to = this.toMinutes(condition.to);
        // Overnight windows (22:00–06:00) wrap around midnight.
        return from <= to
          ? minutes >= from && minutes <= to
          : minutes >= from || minutes <= to;
      }
    }
  }

  private toMinutes(time: string): number {
    const [hours = 0, minutes = 0] = time.split(":").map(Number);
    return hours * 60 + minutes;
  }
}
