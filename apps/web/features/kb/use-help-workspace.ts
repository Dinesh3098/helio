"use client";

import { useSearchParams } from "next/navigation";

/**
 * Public help-center pages resolve their workspace from ?workspace=<id>,
 * falling back to the demo env default. Returns null when neither is set.
 */
export function useHelpWorkspace(): string | null {
  const searchParams = useSearchParams();
  return (
    searchParams.get("workspace") ||
    process.env.NEXT_PUBLIC_DEMO_WORKSPACE_ID ||
    null
  );
}

/** Preserves the ?workspace param when linking within the help center. */
export function helpUrl(path: string, workspaceId: string | null): string {
  return workspaceId ? `${path}?workspace=${workspaceId}` : path;
}
