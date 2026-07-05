"use client";

import { LogOut, PanelLeft, Zap } from "lucide-react";
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
import { useUiStore } from "@/stores/ui-store";
import { ThemeToggle } from "./theme-toggle";

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
