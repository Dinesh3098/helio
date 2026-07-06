"use client";

import { FlaskConical, Loader2, Pencil, Trash2, Zap } from "lucide-react";
import { useState } from "react";
import { EmptyState } from "@/components/shared/empty-state";
import { ErrorState } from "@/components/shared/error-state";
import { Badge } from "@/components/ui/badge";
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
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { AutomationRule } from "@/types/api";
import {
  useAutomationRules,
  useDeleteRule,
  useTestRule,
  useToggleRule,
} from "../hooks";
import { RuleBuilderDialog, TRIGGER_LABELS } from "./rule-builder";

export function RulesList() {
  const rules = useAutomationRules();
  const toggle = useToggleRule();
  const remove = useDeleteRule();
  const test = useTestRule();

  const [builderOpen, setBuilderOpen] = useState(false);
  const [editing, setEditing] = useState<AutomationRule | null>(null);
  const [toDelete, setToDelete] = useState<AutomationRule | null>(null);
  const [toTest, setToTest] = useState<AutomationRule | null>(null);
  const [testConversationId, setTestConversationId] = useState("");

  const openCreate = () => {
    setEditing(null);
    setBuilderOpen(true);
  };
  const openEdit = (rule: AutomationRule) => {
    setEditing(rule);
    setBuilderOpen(true);
  };

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Button onClick={openCreate}>
          <Zap className="size-4" aria-hidden />
          New rule
        </Button>
      </div>

      {rules.isPending ? (
        <div className="space-y-2">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-14 w-full" />
          ))}
        </div>
      ) : rules.isError ? (
        <ErrorState error={rules.error} onRetry={rules.refetch} />
      ) : rules.data.length === 0 ? (
        <EmptyState
          icon={Zap}
          title="No automation rules yet"
          description="Automate assignment, priorities, tags, and replies when conversations happen."
          action={<Button onClick={openCreate}>Create the first rule</Button>}
        />
      ) : (
        <div className="rounded-lg border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-16">Active</TableHead>
                <TableHead>Rule</TableHead>
                <TableHead>Trigger</TableHead>
                <TableHead>Steps</TableHead>
                <TableHead className="w-32 text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rules.data.map((rule) => (
                <TableRow key={rule.id}>
                  <TableCell>
                    <Switch
                      checked={rule.enabled}
                      disabled={toggle.isPending}
                      aria-label={`${rule.enabled ? "Disable" : "Enable"} ${rule.name}`}
                      onCheckedChange={(enabled) =>
                        toggle.mutate({ id: rule.id, enabled })
                      }
                    />
                  </TableCell>
                  <TableCell>
                    <p className="font-medium">{rule.name}</p>
                    {rule.createdByName && (
                      <p className="text-muted-foreground text-xs">
                        by {rule.createdByName}
                      </p>
                    )}
                  </TableCell>
                  <TableCell>
                    <Badge variant="secondary">
                      {TRIGGER_LABELS[rule.trigger]}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-muted-foreground text-sm">
                    {rule.conditions.length} condition
                    {rule.conditions.length === 1 ? "" : "s"} ·{" "}
                    {rule.actions.length} action
                    {rule.actions.length === 1 ? "" : "s"}
                  </TableCell>
                  <TableCell className="text-right">
                    <Button
                      variant="ghost"
                      size="icon"
                      aria-label={`Test ${rule.name}`}
                      title="Run against a conversation"
                      onClick={() => {
                        setTestConversationId("");
                        setToTest(rule);
                      }}
                    >
                      <FlaskConical className="size-4" aria-hidden />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      aria-label={`Edit ${rule.name}`}
                      onClick={() => openEdit(rule)}
                    >
                      <Pencil className="size-4" aria-hidden />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      aria-label={`Delete ${rule.name}`}
                      onClick={() => setToDelete(rule)}
                    >
                      <Trash2 className="size-4" aria-hidden />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      <RuleBuilderDialog
        open={builderOpen}
        onOpenChange={setBuilderOpen}
        rule={editing}
      />

      {/* ---------- delete confirmation ---------- */}
      <Dialog
        open={toDelete !== null}
        onOpenChange={(open) => !open && setToDelete(null)}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Delete rule</DialogTitle>
            <DialogDescription>
              {toDelete
                ? `"${toDelete.name}" and its execution history will be permanently deleted.`
                : null}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setToDelete(null)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              disabled={remove.isPending}
              onClick={() => {
                if (!toDelete) return;
                remove.mutate(toDelete.id, {
                  onSettled: () => setToDelete(null),
                });
              }}
            >
              {remove.isPending && <Loader2 className="animate-spin" />}
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ---------- test runner ---------- */}
      <Dialog
        open={toTest !== null}
        onOpenChange={(open) => !open && setToTest(null)}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Test rule</DialogTitle>
            <DialogDescription>
              Runs &quot;{toTest?.name}&quot; against a real conversation.
              Matching actions <strong>will execute</strong>.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-1.5">
            <Label htmlFor="test-conversation">Conversation ID</Label>
            <Input
              id="test-conversation"
              value={testConversationId}
              onChange={(e) => setTestConversationId(e.target.value)}
              placeholder="Paste a conversation id from the inbox"
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setToTest(null)}>
              Cancel
            </Button>
            <Button
              disabled={!testConversationId.trim() || test.isPending}
              onClick={() => {
                if (!toTest) return;
                test.mutate(
                  {
                    id: toTest.id,
                    conversationId: testConversationId.trim(),
                  },
                  { onSuccess: () => setToTest(null) },
                );
              }}
            >
              {test.isPending && <Loader2 className="animate-spin" />}
              Run test
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
