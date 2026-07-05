"use client";

import { format } from "date-fns";
import { ErrorState } from "@/components/shared/error-state";
import { PageHeader } from "@/components/shared/page-header";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { WorkspaceSettingsForm } from "@/features/workspace/components/workspace-settings-form";
import { useCurrentMember, useWorkspace } from "@/features/workspace/hooks";

export default function SettingsPage() {
  const workspace = useWorkspace();
  const viewer = useCurrentMember();

  return (
    <div className="mx-auto max-w-5xl space-y-6 p-6">
      <PageHeader
        title="Settings"
        description="Configure your workspace."
      />

      <Card>
        <CardHeader>
          <CardTitle>Workspace</CardTitle>
          <CardDescription>
            {workspace.data
              ? `Created ${format(new Date(workspace.data.createdAt), "MMMM d, yyyy")}`
              : "General workspace settings."}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {workspace.isPending ? (
            <div className="max-w-md space-y-3">
              <Skeleton className="h-4 w-32" />
              <Skeleton className="h-9 w-full" />
              <Skeleton className="h-9 w-32" />
            </div>
          ) : workspace.isError ? (
            <ErrorState error={workspace.error} onRetry={workspace.refetch} />
          ) : (
            <div className="space-y-6">
              <WorkspaceSettingsForm
                workspace={workspace.data}
                canEdit={viewer?.role === "OWNER"}
              />
              <div className="max-w-md space-y-1">
                <p className="text-sm font-medium">Workspace ID</p>
                <p className="text-muted-foreground font-mono text-xs">
                  {workspace.data.id}
                </p>
                <p className="text-muted-foreground text-xs">
                  Used to embed the chat widget on your website.
                </p>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
