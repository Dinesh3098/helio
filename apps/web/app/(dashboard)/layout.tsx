"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { Sidebar } from "@/components/layout/sidebar";
import { TopNav } from "@/components/layout/top-nav";
import { Skeleton } from "@/components/ui/skeleton";
import { useMe } from "@/features/auth/hooks";
import { useRealtimeConnection } from "@/features/conversations/realtime";
import { useWorkspaceBootstrap } from "@/features/workspace/hooks";

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { data: me, isPending, isError } = useMe();
  const router = useRouter();
  useRealtimeConnection(me?.id);
  // Workspace-scoped pages must not render (and fire queries) until the
  // x-workspace-id the interceptor sends is confirmed valid.
  const workspaceReady = useWorkspaceBootstrap(!!me);

  useEffect(() => {
    if (isError) {
      router.replace("/login");
    }
  }, [isError, router]);

  if (isPending || isError || !me || !workspaceReady) {
    return (
      <div className="flex h-svh flex-col">
        <div className="flex h-14 items-center gap-3 border-b px-4">
          <Skeleton className="size-8 rounded-md" />
          <Skeleton className="h-4 w-24" />
          <Skeleton className="ml-auto size-8 rounded-full" />
        </div>
        <div className="flex flex-1">
          <div className="w-56 space-y-2 border-r p-3">
            {Array.from({ length: 5 }).map((_, i) => (
              <Skeleton key={i} className="h-8 w-full" />
            ))}
          </div>
          <div className="flex-1 space-y-4 p-6">
            <Skeleton className="h-8 w-48" />
            <Skeleton className="h-64 w-full" />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-svh flex-col">
      <TopNav />
      <div className="flex min-h-0 flex-1">
        <Sidebar />
        <main className="min-w-0 flex-1 overflow-y-auto">{children}</main>
      </div>
    </div>
  );
}
