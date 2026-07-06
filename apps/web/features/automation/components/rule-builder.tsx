"use client";

import { Loader2, Plus, X } from "lucide-react";
import { useEffect, useState } from "react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useMembers } from "@/features/workspace/hooks";
import { getApiErrorMessage } from "@/lib/api/client";
import type {
  AutomationAction,
  AutomationCondition,
  AutomationRule,
  AutomationTrigger,
} from "@/types/api";
import { useCreateRule, useUpdateRule } from "../hooks";

export const TRIGGER_LABELS: Record<AutomationTrigger, string> = {
  CONVERSATION_CREATED: "Conversation created",
  MESSAGE_RECEIVED: "Message received",
  MESSAGE_SENT: "Message sent",
  CONVERSATION_RESOLVED: "Conversation resolved",
  CONVERSATION_REOPENED: "Conversation reopened",
};

const CONDITION_LABELS: Record<AutomationCondition["type"], string> = {
  channel: "Channel is",
  status: "Status is",
  priority: "Priority is",
  emailDomain: "Customer email domain is",
  messageContains: "Message contains",
  assignedTo: "Assigned agent is",
  timeOfDay: "Time of day (UTC) between",
};

const ACTION_LABELS: Record<AutomationAction["type"], string> = {
  assign: "Assign agent",
  setPriority: "Change priority",
  setStatus: "Change status",
  aiSummary: "Generate AI summary",
  aiReply: "Send AI-generated reply",
  autoReply: "Send auto reply",
  addTag: "Add tag",
  removeTag: "Remove tag",
};

function defaultCondition(
  type: AutomationCondition["type"],
): AutomationCondition {
  switch (type) {
    case "channel":
      return { type, value: "CHAT" };
    case "status":
      return { type, value: "OPEN" };
    case "priority":
      return { type, value: "HIGH" };
    case "emailDomain":
      return { type, value: "" };
    case "messageContains":
      return { type, value: "" };
    case "assignedTo":
      return { type, value: null };
    case "timeOfDay":
      return { type, from: "09:00", to: "17:00" };
  }
}

function defaultAction(type: AutomationAction["type"]): AutomationAction {
  switch (type) {
    case "assign":
      return { type, userId: "" };
    case "setPriority":
      return { type, priority: "HIGH" };
    case "setStatus":
      return { type, status: "RESOLVED" };
    case "aiSummary":
      return { type };
    case "aiReply":
      return { type, instructions: "" };
    case "autoReply":
      return { type, content: "" };
    case "addTag":
      return { type, tag: "" };
    case "removeTag":
      return { type, tag: "" };
  }
}

const UNASSIGNED = "__unassigned__";

export function RuleBuilderDialog({
  open,
  onOpenChange,
  rule,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** null = create */
  rule: AutomationRule | null;
}) {
  const members = useMembers();
  const create = useCreateRule();
  const update = useUpdateRule();
  const mutation = rule ? update : create;

  const [name, setName] = useState("");
  const [trigger, setTrigger] = useState<AutomationTrigger>(
    "CONVERSATION_CREATED",
  );
  const [conditions, setConditions] = useState<AutomationCondition[]>([]);
  const [actions, setActions] = useState<AutomationAction[]>([]);
  const [validationError, setValidationError] = useState<string | null>(null);

  // Re-seed the form whenever the dialog opens for a different rule.
  useEffect(() => {
    if (!open) return;
    setName(rule?.name ?? "");
    setTrigger(rule?.trigger ?? "CONVERSATION_CREATED");
    setConditions(rule?.conditions ?? []);
    setActions(rule?.actions ?? []);
    setValidationError(null);
    create.reset();
    update.reset();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, rule?.id]);

  const patchCondition = (index: number, next: AutomationCondition) =>
    setConditions((current) =>
      current.map((c, i) => (i === index ? next : c)),
    );
  const patchAction = (index: number, next: AutomationAction) =>
    setActions((current) => current.map((a, i) => (i === index ? next : a)));

  const submit = () => {
    if (!name.trim()) {
      setValidationError("Give the rule a name");
      return;
    }
    if (actions.length === 0) {
      setValidationError("Add at least one action");
      return;
    }
    setValidationError(null);
    const input = { name: name.trim(), trigger, conditions, actions };
    const options = { onSuccess: () => onOpenChange(false) };
    if (rule) {
      update.mutate({ id: rule.id, ...input }, options);
    } else {
      create.mutate(input, options);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{rule ? "Edit rule" : "New automation rule"}</DialogTitle>
          <DialogDescription>
            When the trigger fires and all conditions match, actions run in
            order.
          </DialogDescription>
        </DialogHeader>

        {(validationError || mutation.isError) && (
          <Alert variant="destructive">
            <AlertDescription>
              {validationError ?? getApiErrorMessage(mutation.error)}
            </AlertDescription>
          </Alert>
        )}

        <div className="grid gap-4">
          <div className="flex flex-wrap gap-3">
            <div className="grid min-w-52 flex-1 gap-1.5">
              <Label htmlFor="rule-name">Name</Label>
              <Input
                id="rule-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Route billing emails"
              />
            </div>
            <div className="grid w-56 gap-1.5">
              <Label htmlFor="rule-trigger">When</Label>
              <Select
                value={trigger}
                onValueChange={(value) =>
                  setTrigger(value as AutomationTrigger)
                }
              >
                <SelectTrigger id="rule-trigger" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(TRIGGER_LABELS).map(([value, label]) => (
                    <SelectItem key={value} value={value}>
                      {label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* ---------- Conditions ---------- */}
          <fieldset className="grid gap-2">
            <legend className="text-sm font-medium">
              If all of these match{" "}
              <span className="text-muted-foreground font-normal">
                (empty = always)
              </span>
            </legend>
            {conditions.map((condition, index) => (
              <div key={index} className="flex items-center gap-2">
                <Select
                  value={condition.type}
                  onValueChange={(type) =>
                    patchCondition(
                      index,
                      defaultCondition(type as AutomationCondition["type"]),
                    )
                  }
                >
                  <SelectTrigger className="w-56" aria-label="Condition type">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {Object.entries(CONDITION_LABELS).map(([value, label]) => (
                      <SelectItem key={value} value={value}>
                        {label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>

                {condition.type === "channel" && (
                  <Select
                    value={condition.value}
                    onValueChange={(value) =>
                      patchCondition(index, {
                        type: "channel",
                        value: value as "CHAT" | "EMAIL",
                      })
                    }
                  >
                    <SelectTrigger className="flex-1" aria-label="Channel">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="CHAT">Chat</SelectItem>
                      <SelectItem value="EMAIL">Email</SelectItem>
                    </SelectContent>
                  </Select>
                )}
                {condition.type === "status" && (
                  <Select
                    value={condition.value}
                    onValueChange={(value) =>
                      patchCondition(index, {
                        type: "status",
                        value: value as typeof condition.value,
                      })
                    }
                  >
                    <SelectTrigger className="flex-1" aria-label="Status">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="OPEN">Open</SelectItem>
                      <SelectItem value="SNOOZED">Snoozed</SelectItem>
                      <SelectItem value="RESOLVED">Resolved</SelectItem>
                    </SelectContent>
                  </Select>
                )}
                {condition.type === "priority" && (
                  <Select
                    value={condition.value}
                    onValueChange={(value) =>
                      patchCondition(index, {
                        type: "priority",
                        value: value as typeof condition.value,
                      })
                    }
                  >
                    <SelectTrigger className="flex-1" aria-label="Priority">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="LOW">Low</SelectItem>
                      <SelectItem value="MEDIUM">Medium</SelectItem>
                      <SelectItem value="HIGH">High</SelectItem>
                    </SelectContent>
                  </Select>
                )}
                {(condition.type === "emailDomain" ||
                  condition.type === "messageContains") && (
                  <Input
                    className="flex-1"
                    value={condition.value}
                    placeholder={
                      condition.type === "emailDomain"
                        ? "gmail.com"
                        : "refund"
                    }
                    aria-label="Condition value"
                    onChange={(e) =>
                      patchCondition(index, {
                        type: condition.type,
                        value: e.target.value,
                      })
                    }
                  />
                )}
                {condition.type === "assignedTo" && (
                  <Select
                    value={condition.value ?? UNASSIGNED}
                    onValueChange={(value) =>
                      patchCondition(index, {
                        type: "assignedTo",
                        value: value === UNASSIGNED ? null : value,
                      })
                    }
                  >
                    <SelectTrigger className="flex-1" aria-label="Agent">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value={UNASSIGNED}>Unassigned</SelectItem>
                      {members.data?.map((member) => (
                        <SelectItem key={member.userId} value={member.userId}>
                          {member.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
                {condition.type === "timeOfDay" && (
                  <div className="flex flex-1 items-center gap-2">
                    <Input
                      type="time"
                      value={condition.from}
                      aria-label="From (UTC)"
                      onChange={(e) =>
                        patchCondition(index, {
                          ...condition,
                          from: e.target.value,
                        })
                      }
                    />
                    <span className="text-muted-foreground text-xs">and</span>
                    <Input
                      type="time"
                      value={condition.to}
                      aria-label="To (UTC)"
                      onChange={(e) =>
                        patchCondition(index, {
                          ...condition,
                          to: e.target.value,
                        })
                      }
                    />
                  </div>
                )}

                <Button
                  variant="ghost"
                  size="icon"
                  aria-label="Remove condition"
                  onClick={() =>
                    setConditions((c) => c.filter((_, i) => i !== index))
                  }
                >
                  <X className="size-4" aria-hidden />
                </Button>
              </div>
            ))}
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="w-fit"
              onClick={() =>
                setConditions((c) => [...c, defaultCondition("channel")])
              }
            >
              <Plus className="size-4" aria-hidden /> Add condition
            </Button>
          </fieldset>

          {/* ---------- Actions ---------- */}
          <fieldset className="grid gap-2">
            <legend className="text-sm font-medium">Then do</legend>
            {actions.map((action, index) => (
              <div key={index} className="flex items-center gap-2">
                <Select
                  value={action.type}
                  onValueChange={(type) =>
                    patchAction(
                      index,
                      defaultAction(type as AutomationAction["type"]),
                    )
                  }
                >
                  <SelectTrigger className="w-56" aria-label="Action type">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {Object.entries(ACTION_LABELS).map(([value, label]) => (
                      <SelectItem key={value} value={value}>
                        {label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>

                {action.type === "assign" && (
                  <Select
                    value={action.userId || undefined}
                    onValueChange={(userId) =>
                      patchAction(index, { type: "assign", userId })
                    }
                  >
                    <SelectTrigger className="flex-1" aria-label="Agent">
                      <SelectValue placeholder="Pick an agent" />
                    </SelectTrigger>
                    <SelectContent>
                      {members.data?.map((member) => (
                        <SelectItem key={member.userId} value={member.userId}>
                          {member.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
                {action.type === "setPriority" && (
                  <Select
                    value={action.priority}
                    onValueChange={(priority) =>
                      patchAction(index, {
                        type: "setPriority",
                        priority: priority as typeof action.priority,
                      })
                    }
                  >
                    <SelectTrigger className="flex-1" aria-label="Priority">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="LOW">Low</SelectItem>
                      <SelectItem value="MEDIUM">Medium</SelectItem>
                      <SelectItem value="HIGH">High</SelectItem>
                    </SelectContent>
                  </Select>
                )}
                {action.type === "setStatus" && (
                  <Select
                    value={action.status}
                    onValueChange={(status) =>
                      patchAction(index, {
                        type: "setStatus",
                        status: status as typeof action.status,
                      })
                    }
                  >
                    <SelectTrigger className="flex-1" aria-label="Status">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="OPEN">Open</SelectItem>
                      <SelectItem value="SNOOZED">Snoozed</SelectItem>
                      <SelectItem value="RESOLVED">Resolved</SelectItem>
                    </SelectContent>
                  </Select>
                )}
                {action.type === "aiReply" && (
                  <Input
                    className="flex-1"
                    value={action.instructions ?? ""}
                    placeholder="Optional instructions for the AI"
                    aria-label="AI instructions"
                    onChange={(e) =>
                      patchAction(index, {
                        type: "aiReply",
                        instructions: e.target.value,
                      })
                    }
                  />
                )}
                {action.type === "autoReply" && (
                  <Input
                    className="flex-1"
                    value={action.content}
                    placeholder="Reply text sent to the customer"
                    aria-label="Reply content"
                    onChange={(e) =>
                      patchAction(index, {
                        type: "autoReply",
                        content: e.target.value,
                      })
                    }
                  />
                )}
                {(action.type === "addTag" || action.type === "removeTag") && (
                  <Input
                    className="flex-1"
                    value={action.tag}
                    placeholder="tag-name"
                    aria-label="Tag"
                    onChange={(e) =>
                      patchAction(index, {
                        type: action.type,
                        tag: e.target.value,
                      })
                    }
                  />
                )}
                {action.type === "aiSummary" && (
                  <span className="text-muted-foreground flex-1 text-sm">
                    Stores a summary on the conversation
                  </span>
                )}

                <Button
                  variant="ghost"
                  size="icon"
                  aria-label="Remove action"
                  onClick={() =>
                    setActions((a) => a.filter((_, i) => i !== index))
                  }
                >
                  <X className="size-4" aria-hidden />
                </Button>
              </div>
            ))}
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="w-fit"
              onClick={() =>
                setActions((a) => [...a, defaultAction("setPriority")])
              }
            >
              <Plus className="size-4" aria-hidden /> Add action
            </Button>
          </fieldset>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={mutation.isPending}>
            {mutation.isPending && <Loader2 className="animate-spin" />}
            {rule ? "Save rule" : "Create rule"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
