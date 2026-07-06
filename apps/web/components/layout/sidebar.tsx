"use client";

import {
  Activity,
  BookOpen,
  Inbox,
  ScrollText,
  Settings,
  Users,
  UsersRound,
  Zap,
} from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useCurrentMember } from "@/features/workspace/hooks";
import { cn } from "@/lib/utils";
import { useUiStore } from "@/stores/ui-store";

const NAV_ITEMS = [
  { href: "/inbox", label: "Inbox", icon: Inbox },
  { href: "/contacts", label: "Contacts", icon: UsersRound },
  { href: "/team", label: "Team", icon: Users },
  { href: "/knowledge-base", label: "Knowledge Base", icon: BookOpen },
  { href: "/automation", label: "Automation", icon: Zap },
  { href: "/settings", label: "Settings", icon: Settings },
];

// Owner/admin-only pages, mirroring the backend RBAC.
const ADMIN_NAV_ITEMS = [
  { href: "/audit", label: "Audit Logs", icon: ScrollText },
  { href: "/system", label: "System Health", icon: Activity },
];

export function Sidebar() {
  const pathname = usePathname();
  const collapsed = useUiStore((s) => s.sidebarCollapsed);
  const viewer = useCurrentMember();
  const isManager = viewer?.role === "OWNER" || viewer?.role === "ADMIN";

  const items = isManager ? [...NAV_ITEMS, ...ADMIN_NAV_ITEMS] : NAV_ITEMS;

  return (
    <aside
      className={cn(
        "bg-sidebar text-sidebar-foreground border-sidebar-border flex shrink-0 flex-col gap-1 border-r p-2 transition-[width]",
        collapsed ? "w-14" : "w-56",
      )}
    >
      <nav aria-label="Main navigation" className="grid gap-1">
        {items.map((item) => {
          const active = pathname.startsWith(item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              aria-current={active ? "page" : undefined}
              title={collapsed ? item.label : undefined}
              className={cn(
                "flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors",
                active
                  ? "bg-sidebar-accent text-sidebar-accent-foreground"
                  : "text-muted-foreground hover:bg-sidebar-accent/60 hover:text-sidebar-accent-foreground",
                collapsed && "justify-center px-2",
              )}
            >
              <item.icon className="size-4 shrink-0" aria-hidden />
              {!collapsed && item.label}
            </Link>
          );
        })}
      </nav>
    </aside>
  );
}
