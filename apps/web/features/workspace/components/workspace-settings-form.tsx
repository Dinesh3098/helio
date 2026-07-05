"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { Loader2 } from "lucide-react";
import { useForm } from "react-hook-form";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { Workspace } from "@/types/api";
import { useUpdateWorkspace } from "../hooks";
import {
  workspaceSettingsSchema,
  type WorkspaceSettingsValues,
} from "../schemas";

export function WorkspaceSettingsForm({
  workspace,
  canEdit,
}: {
  workspace: Workspace;
  canEdit: boolean;
}) {
  const update = useUpdateWorkspace();
  const form = useForm<WorkspaceSettingsValues>({
    resolver: zodResolver(workspaceSettingsSchema),
    values: { name: workspace.name },
  });

  const onSubmit = form.handleSubmit((values) => update.mutate(values));

  return (
    <form onSubmit={onSubmit} className="grid max-w-md gap-4" noValidate>
      <div className="grid gap-2">
        <Label htmlFor="workspace-name">Workspace name</Label>
        <Input
          id="workspace-name"
          disabled={!canEdit}
          aria-invalid={!!form.formState.errors.name}
          {...form.register("name")}
        />
        {form.formState.errors.name && (
          <p className="text-destructive text-sm" role="alert">
            {form.formState.errors.name.message}
          </p>
        )}
        {!canEdit && (
          <p className="text-muted-foreground text-sm">
            Only the workspace owner can rename the workspace.
          </p>
        )}
      </div>

      {canEdit && (
        <div>
          <Button
            type="submit"
            disabled={update.isPending || !form.formState.isDirty}
          >
            {update.isPending && <Loader2 className="animate-spin" />}
            Save changes
          </Button>
        </div>
      )}
    </form>
  );
}
