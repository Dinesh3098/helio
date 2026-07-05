"use client";

import { Check, ChevronsUpDown, LogOut, PanelLeft, Zap } from "lucide-react";
import Link from "next/link";
import { InitialsAvatar } from "@/components/shared/initials-avatar";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useLogout, useMe } from "@/features/auth/hooks";
import {
  useMyWorkspaces,
  useSwitchWorkspace,
} from "@/features/workspace/hooks";
import { useUiStore } from "@/stores/ui-store";
import { useWorkspaceStore } from "@/stores/workspace-store";
import { ThemeToggle } from "./theme-toggle";

function WorkspaceSwitcher() {
  const workspaces = useMyWorkspaces();
  const activeWorkspaceId = useWorkspaceStore((s) => s.activeWorkspaceId);
  const switchWorkspace = useSwitchWorkspace();

  const list = workspaces.data ?? [];
  const active = list.find((w) => w.workspaceId === activeWorkspaceId);
  if (!active) return null;

  // Single-workspace users just see the name — no dead dropdown.
  if (list.length === 1) {
    return (
      <span className="text-muted-foreground max-w-40 truncate text-sm">
        {active.name}
      </span>
    );
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="sm" aria-label="Switch workspace">
          <span className="max-w-40 truncate">{active.name}</span>
          <ChevronsUpDown className="size-3.5" aria-hidden />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-64">
        <DropdownMenuLabel>Workspaces</DropdownMenuLabel>
        {list.map((workspace) => (
          <DropdownMenuItem
            key={workspace.workspaceId}
            onSelect={() => switchWorkspace(workspace.workspaceId)}
          >
            <span className="min-w-0 flex-1 truncate">{workspace.name}</span>
            <span className="text-muted-foreground text-xs capitalize">
              {workspace.role.toLowerCase()}
            </span>
            {workspace.workspaceId === activeWorkspaceId && (
              <Check className="size-4" aria-hidden />
            )}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export function TopNav() {
  const { data: me } = useMe();
  const logout = useLogout();
  const toggleSidebar = useUiStore((s) => s.toggleSidebar);

  return (
    <header className="bg-background flex h-14 shrink-0 items-center gap-2 border-b px-4">
      <Button
        variant="ghost"
        size="icon"
        aria-label="Toggle sidebar"
        onClick={toggleSidebar}
      >
        <PanelLeft className="size-4" aria-hidden />
      </Button>

      <Link href="/inbox" className="flex items-center gap-2">
        <div className="bg-primary text-primary-foreground flex size-6 items-center justify-center rounded-md">
          <Zap className="size-3.5" aria-hidden />
        </div>
        <span className="font-semibold tracking-tight">Helio</span>
      </Link>

      <span className="text-border mx-1" aria-hidden>
        /
      </span>
      <WorkspaceSwitcher />

      <div className="ml-auto flex items-center gap-1">
        <ThemeToggle />
        {me && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="rounded-full"
                aria-label="Account menu"
              >
                <InitialsAvatar name={me.name} />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56">
              <DropdownMenuLabel>
                <p className="truncate font-medium">{me.name}</p>
                <p className="text-muted-foreground truncate text-xs font-normal">
                  {me.email}
                </p>
              </DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                onSelect={() => logout.mutate()}
                disabled={logout.isPending}
              >
                <LogOut className="size-4" aria-hidden />
                Log out
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </div>
    </header>
  );
}
