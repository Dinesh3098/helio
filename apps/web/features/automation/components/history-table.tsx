"use client";

import { format } from "date-fns";
import { History } from "lucide-react";
import { useState } from "react";
import { EmptyState } from "@/components/shared/empty-state";
import { ErrorState } from "@/components/shared/error-state";
import { PaginationControls } from "@/components/shared/pagination-controls";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { AutomationExecution } from "@/types/api";
import { useAutomationHistory, useAutomationRules } from "../hooks";

const PAGE_LIMIT = 20;
const ALL_RULES = "all";

export function HistoryTable() {
  const [ruleId, setRuleId] = useState(ALL_RULES);
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<AutomationExecution | null>(null);

  const rules = useAutomationRules();
  const history = useAutomationHistory({
    ruleId: ruleId === ALL_RULES ? undefined : ruleId,
    page,
  });

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Select
          value={ruleId}
          onValueChange={(value) => {
            setRuleId(value);
            setPage(1);
          }}
        >
          <SelectTrigger className="w-56" aria-label="Filter by rule">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL_RULES}>All rules</SelectItem>
            {rules.data?.map((rule) => (
              <SelectItem key={rule.id} value={rule.id}>
                {rule.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {history.isPending ? (
        <div className="space-y-2">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-12 w-full" />
          ))}
        </div>
      ) : history.isError ? (
        <ErrorState error={history.error} onRetry={history.refetch} />
      ) : history.data.data.length === 0 ? (
        <EmptyState
          icon={History}
          title="No executions yet"
          description="Runs appear here as soon as a rule matches an event."
        />
      ) : (
        <>
          <div className="rounded-lg border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Rule</TableHead>
                  <TableHead>Conversation</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Ran at</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {history.data.data.map((execution) => (
                  <TableRow
                    key={execution.id}
                    tabIndex={0}
                    className="cursor-pointer"
                    onClick={() => setSelected(execution)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") setSelected(execution);
                    }}
                  >
                    <TableCell className="font-medium">
                      {execution.ruleName}
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {execution.contactName}
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant={
                          execution.status === "SUCCESS"
                            ? "secondary"
                            : "destructive"
                        }
                      >
                        {execution.status}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {format(new Date(execution.startedAt), "MMM d, p")}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>

          <PaginationControls
            page={page}
            total={history.data.total}
            limit={PAGE_LIMIT}
            onPageChange={setPage}
          />
        </>
      )}

      <Dialog
        open={selected !== null}
        onOpenChange={(open) => !open && setSelected(null)}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Execution detail</DialogTitle>
            <DialogDescription>{selected?.ruleName}</DialogDescription>
          </DialogHeader>
          {selected && (
            <dl className="grid grid-cols-[7rem_1fr] gap-y-2 text-sm">
              <dt className="text-muted-foreground">Status</dt>
              <dd>
                <Badge
                  variant={
                    selected.status === "SUCCESS" ? "secondary" : "destructive"
                  }
                >
                  {selected.status}
                </Badge>
              </dd>
              <dt className="text-muted-foreground">Conversation</dt>
              <dd className="truncate font-mono text-xs">
                {selected.conversationId}
              </dd>
              <dt className="text-muted-foreground">Contact</dt>
              <dd>{selected.contactName}</dd>
              <dt className="text-muted-foreground">Started</dt>
              <dd>{format(new Date(selected.startedAt), "PPpp")}</dd>
              <dt className="text-muted-foreground">Finished</dt>
              <dd>
                {selected.finishedAt
                  ? format(new Date(selected.finishedAt), "PPpp")
                  : "—"}
              </dd>
              {selected.error && (
                <>
                  <dt className="text-destructive">Error</dt>
                  <dd className="text-destructive">{selected.error}</dd>
                </>
              )}
            </dl>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
