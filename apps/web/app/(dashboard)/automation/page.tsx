"use client";

import { ShieldAlert } from "lucide-react";
import { EmptyState } from "@/components/shared/empty-state";
import { PageHeader } from "@/components/shared/page-header";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useState } from "react";
import { HistoryTable } from "@/features/automation/components/history-table";
import { RulesList } from "@/features/automation/components/rules-list";
import { useCurrentMember } from "@/features/workspace/hooks";

export default function AutomationPage() {
  const viewer = useCurrentMember();
  const [tab, setTab] = useState<"rules" | "history">("rules");

  // Mirrors the backend: automation is owner/admin only.
  if (viewer && viewer.role === "AGENT") {
    return (
      <div className="mx-auto max-w-5xl p-6">
        <EmptyState
          icon={ShieldAlert}
          title="Owners and admins only"
          description="Automation rules change how the whole workspace behaves, so agents can't manage them."
        />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-5xl space-y-6 p-6">
      <PageHeader
        title="Automation"
        description="Rules that run automatically when conversation events happen."
        actions={
          <Tabs
            value={tab}
            onValueChange={(value) => setTab(value as typeof tab)}
          >
            <TabsList>
              <TabsTrigger value="rules">Rules</TabsTrigger>
              <TabsTrigger value="history">History</TabsTrigger>
            </TabsList>
          </Tabs>
        }
      />
      {tab === "rules" ? <RulesList /> : <HistoryTable />}
    </div>
  );
}
