import { BadRequestException } from "@nestjs/common";
import {
  ConversationChannel,
  ConversationPriority,
  ConversationStatus,
} from "../../database/entities";

/**
 * Typed shapes behind the rules' jsonb columns. Discriminated unions +
 * runtime validators — class-validator can't express this cleanly, and
 * these validators double as the single schema reference for the UI.
 */

export type AutomationCondition =
  | { type: "channel"; value: ConversationChannel }
  | { type: "status"; value: ConversationStatus }
  | { type: "priority"; value: ConversationPriority }
  | { type: "emailDomain"; value: string }
  | { type: "messageContains"; value: string }
  | { type: "assignedTo"; value: string | null }
  | { type: "timeOfDay"; from: string; to: string };

export type AutomationAction =
  | { type: "assign"; userId: string }
  | { type: "setPriority"; priority: ConversationPriority }
  | { type: "setStatus"; status: ConversationStatus }
  | { type: "aiSummary" }
  | { type: "aiReply"; instructions?: string }
  | { type: "autoReply"; content: string }
  | { type: "addTag"; tag: string }
  | { type: "removeTag"; tag: string };

const TIME_PATTERN = /^([01]\d|2[0-3]):[0-5]\d$/;
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function fail(index: number, kind: string, message: string): never {
  throw new BadRequestException(`${kind} ${index + 1}: ${message}`);
}

function isEnum<T extends string>(
  value: unknown,
  values: readonly T[],
): value is T {
  return (
    typeof value === "string" && (values as readonly string[]).includes(value)
  );
}

function requireString(
  value: unknown,
  index: number,
  kind: string,
  field: string,
  maxLength: number,
): string {
  if (typeof value !== "string" || !value.trim()) {
    fail(index, kind, `"${field}" must be a non-empty string`);
  }
  if (value.length > maxLength) {
    fail(index, kind, `"${field}" is too long`);
  }
  return value.trim();
}

export function validateConditions(raw: unknown): AutomationCondition[] {
  if (!Array.isArray(raw)) {
    throw new BadRequestException("conditions must be an array");
  }
  if (raw.length > 10) {
    throw new BadRequestException("A rule supports at most 10 conditions");
  }
  return raw.map((item, i) => {
    const condition = item as Record<string, unknown>;
    switch (condition.type) {
      case "channel":
        if (!isEnum(condition.value, Object.values(ConversationChannel))) {
          fail(i, "Condition", "channel must be CHAT or EMAIL");
        }
        return { type: "channel", value: condition.value };
      case "status":
        if (!isEnum(condition.value, Object.values(ConversationStatus))) {
          fail(i, "Condition", "invalid status");
        }
        return { type: "status", value: condition.value };
      case "priority":
        if (!isEnum(condition.value, Object.values(ConversationPriority))) {
          fail(i, "Condition", "invalid priority");
        }
        return { type: "priority", value: condition.value };
      case "emailDomain":
        return {
          type: "emailDomain",
          value: requireString(condition.value, i, "Condition", "value", 255)
            .toLowerCase()
            .replace(/^@/, ""),
        };
      case "messageContains":
        return {
          type: "messageContains",
          value: requireString(condition.value, i, "Condition", "value", 255),
        };
      case "assignedTo":
        if (condition.value === null) {
          return { type: "assignedTo", value: null };
        }
        if (
          typeof condition.value !== "string" ||
          !UUID_PATTERN.test(condition.value)
        ) {
          fail(i, "Condition", "assignedTo must be a user id or null");
        }
        return { type: "assignedTo", value: condition.value };
      case "timeOfDay": {
        const from = condition.from;
        const to = condition.to;
        if (
          typeof from !== "string" ||
          typeof to !== "string" ||
          !TIME_PATTERN.test(from) ||
          !TIME_PATTERN.test(to)
        ) {
          fail(i, "Condition", "timeOfDay needs from/to as HH:MM (24h, UTC)");
        }
        return { type: "timeOfDay", from, to };
      }
      default:
        fail(i, "Condition", `unknown type "${String(condition.type)}"`);
    }
  });
}

export function validateActions(raw: unknown): AutomationAction[] {
  if (!Array.isArray(raw)) {
    throw new BadRequestException("actions must be an array");
  }
  if (raw.length === 0) {
    throw new BadRequestException("A rule needs at least one action");
  }
  if (raw.length > 10) {
    throw new BadRequestException("A rule supports at most 10 actions");
  }
  return raw.map((item, i) => {
    const action = item as Record<string, unknown>;
    switch (action.type) {
      case "assign":
        if (
          typeof action.userId !== "string" ||
          !UUID_PATTERN.test(action.userId)
        ) {
          fail(i, "Action", "assign needs a userId");
        }
        return { type: "assign", userId: action.userId };
      case "setPriority":
        if (!isEnum(action.priority, Object.values(ConversationPriority))) {
          fail(i, "Action", "invalid priority");
        }
        return { type: "setPriority", priority: action.priority };
      case "setStatus":
        if (!isEnum(action.status, Object.values(ConversationStatus))) {
          fail(i, "Action", "invalid status");
        }
        return { type: "setStatus", status: action.status };
      case "aiSummary":
        return { type: "aiSummary" };
      case "aiReply":
        if (action.instructions !== undefined) {
          return {
            type: "aiReply",
            instructions: requireString(
              action.instructions,
              i,
              "Action",
              "instructions",
              500,
            ),
          };
        }
        return { type: "aiReply" };
      case "autoReply":
        return {
          type: "autoReply",
          content: requireString(
            action.content,
            i,
            "Action",
            "content",
            10_000,
          ),
        };
      case "addTag":
        return {
          type: "addTag",
          tag: requireString(action.tag, i, "Action", "tag", 50),
        };
      case "removeTag":
        return {
          type: "removeTag",
          tag: requireString(action.tag, i, "Action", "tag", 50),
        };
      default:
        fail(i, "Action", `unknown type "${String(action.type)}"`);
    }
  });
}
