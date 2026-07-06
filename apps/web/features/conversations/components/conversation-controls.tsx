"use client";

import { useMe } from "@/features/auth/hooks";
import { useCurrentMember, useMembers } from "@/features/workspace/hooks";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import type {
  ConversationDetail,
  ConversationPriority,
  ConversationStatus,
} from "@/types/api";
import { useAssignConversation, useUpdateConversation } from "../hooks";

const STATUS_OPTIONS: { value: ConversationStatus; label: string }[] = [
  { value: "OPEN", label: "Open" },
  { value: "SNOOZED", label: "Snoozed" },
  { value: "RESOLVED", label: "Resolved" },
];

const STATUS_TRIGGER_STYLES: Record<ConversationStatus, string> = {
  OPEN: "text-emerald-700 dark:text-emerald-400",
  SNOOZED: "text-amber-700 dark:text-amber-400",
  RESOLVED: "text-muted-foreground",
};

const PRIORITY_OPTIONS: { value: ConversationPriority; label: string }[] = [
  { value: "LOW", label: "Low" },
  { value: "MEDIUM", label: "Medium" },
  { value: "HIGH", label: "High" },
];

const UNASSIGNED = "unassigned";

/**
 * Header dropdowns for status / priority / assignee. Every change PATCHes
 * immediately, updates the React Query caches in place, and reaches other
 * dashboards in this conversation's room via conversationUpdated.
 */
export function ConversationControls({
  detail,
}: {
  detail: ConversationDetail;
}) {
  const { data: me } = useMe();
  const viewer = useCurrentMember();
  const members = useMembers();
  const update = useUpdateConversation(detail.id);
  const assign = useAssignConversation(detail.id);

  const isAgent = viewer?.role === "AGENT";
  // Backend rule mirrored: agents may only take/release their own
  // conversations — one held by someone else is read-only for them.
  const assigneeLocked =
    isAgent &&
    detail.assignedToUserId !== null &&
    detail.assignedToUserId !== me?.id;
  const assignableMembers = isAgent
    ? (members.data ?? []).filter((member) => member.userId === me?.id)
    : (members.data ?? []);

  const onAssigneeChange = (value: string) => {
    if (value === UNASSIGNED) {
      assign.mutate({ workspaceMemberId: null, assignee: null });
      return;
    }
    const member = members.data?.find((m) => m.id === value);
    if (!member) return;
    assign.mutate({
      workspaceMemberId: member.id,
      assignee: {
        userId: member.userId,
        name: member.name,
        email: member.email,
      },
    });
  };

  const currentMemberId =
    members.data?.find((m) => m.userId === detail.assignedToUserId)?.id ??
    UNASSIGNED;

  return (
    <div className="flex items-center gap-1.5">
      <Select
        value={detail.status}
        disabled={update.isPending}
        onValueChange={(value) =>
          update.mutate({ status: value as ConversationStatus })
        }
      >
        <SelectTrigger
          size="sm"
          aria-label="Conversation status"
          className={cn("w-28", STATUS_TRIGGER_STYLES[detail.status])}
        >
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {STATUS_OPTIONS.map((option) => (
            <SelectItem key={option.value} value={option.value}>
              {option.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Select
        value={detail.priority}
        disabled={update.isPending}
        onValueChange={(value) =>
          update.mutate({ priority: value as ConversationPriority })
        }
      >
        <SelectTrigger
          size="sm"
          aria-label="Conversation priority"
          className="w-26"
        >
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {PRIORITY_OPTIONS.map((option) => (
            <SelectItem key={option.value} value={option.value}>
              {option.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Select
        value={currentMemberId}
        disabled={assign.isPending || assigneeLocked || members.isPending}
        onValueChange={onAssigneeChange}
      >
        <SelectTrigger
          size="sm"
          aria-label="Assigned agent"
          title={
            assigneeLocked
              ? "Assigned to another teammate — only owners and admins can reassign"
              : undefined
          }
          className="w-36"
        >
          <SelectValue placeholder="Unassigned" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={UNASSIGNED}>Unassigned</SelectItem>
          {assignableMembers.map((member) => (
            <SelectItem key={member.id} value={member.id}>
              {member.userId === me?.id ? `${member.name} (you)` : member.name}
            </SelectItem>
          ))}
          {/* Keep the current assignee visible even when not assignable. */}
          {assigneeLocked && detail.assignee && (
            <SelectItem value={currentMemberId} disabled>
              {detail.assignee.name}
            </SelectItem>
          )}
        </SelectContent>
      </Select>
    </div>
  );
}
