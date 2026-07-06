"use client";

import {
  Activity,
  Cpu,
  Radio,
  ShieldAlert,
  Timer,
} from "lucide-react";
import { EmptyState } from "@/components/shared/empty-state";
import { ErrorState } from "@/components/shared/error-state";
import { PageHeader } from "@/components/shared/page-header";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { useSystemStatus } from "@/features/observability/hooks";
import { useCurrentMember } from "@/features/workspace/hooks";
import { cn } from "@/lib/utils";

const STATUS_STYLES: Record<string, string> = {
  up: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400",
  configured: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400",
  down: "bg-red-500/15 text-red-700 dark:text-red-400",
  unconfigured: "bg-amber-500/15 text-amber-700 dark:text-amber-400",
};

function formatUptime(seconds: number): string {
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  if (days > 0) return `${days}d ${hours}h ${minutes}m`;
  if (hours > 0) return `${hours}h ${minutes}m`;
  return `${minutes}m ${seconds % 60}s`;
}

export default function SystemHealthPage() {
  const viewer = useCurrentMember();
  const status = useSystemStatus();

  if (viewer && viewer.role === "AGENT") {
    return (
      <div className="mx-auto max-w-5xl p-6">
        <EmptyState
          icon={ShieldAlert}
          title="Owners and admins only"
          description="System health is restricted to workspace administrators."
        />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-5xl space-y-6 p-6">
      <PageHeader
        title="System Health"
        description="Live status of the Helio platform. Refreshes every 10 seconds."
      />

      {status.isPending ? (
        <div className="grid gap-4 sm:grid-cols-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-32 w-full" />
          ))}
        </div>
      ) : status.isError ? (
        <ErrorState error={status.error} onRetry={status.refetch} />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <Activity className="size-4" aria-hidden />
                Services
              </CardTitle>
            </CardHeader>
            <CardContent>
              <ul className="space-y-2">
                {status.data.services.map((service) => (
                  <li
                    key={service.name}
                    className="flex items-center justify-between text-sm"
                  >
                    <span>{service.name}</span>
                    <span className="flex items-center gap-2">
                      {service.latencyMs !== undefined && (
                        <span className="text-muted-foreground text-xs">
                          {service.latencyMs} ms
                        </span>
                      )}
                      <Badge
                        className={cn(
                          "border-transparent",
                          STATUS_STYLES[service.status] ?? "",
                        )}
                      >
                        {service.status}
                      </Badge>
                    </span>
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <Radio className="size-4" aria-hidden />
                Realtime
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Open sockets</span>
                <span className="font-medium">
                  {status.data.sockets.connections}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Connected users</span>
                <span className="font-medium">{status.data.sockets.users}</span>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <Cpu className="size-4" aria-hidden />
                Process
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Memory (RSS)</span>
                <span className="font-medium">{status.data.memory.rssMb} MB</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Heap</span>
                <span className="font-medium">
                  {status.data.memory.heapUsedMb} /{" "}
                  {status.data.memory.heapTotalMb} MB
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Node</span>
                <span className="font-medium">{status.data.node}</span>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <Timer className="size-4" aria-hidden />
                Build
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Uptime</span>
                <span className="font-medium">
                  {formatUptime(status.data.uptimeSeconds)}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Version</span>
                <span className="font-medium">v{status.data.version}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Environment</span>
                <Badge variant="secondary">{status.data.environment}</Badge>
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
