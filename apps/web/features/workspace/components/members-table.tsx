"use client";

import { format } from "date-fns";
import { Loader2, Trash2, Users } from "lucide-react";
import { useState } from "react";
import { EmptyState } from "@/components/shared/empty-state";
import { ErrorState } from "@/components/shared/error-state";
import { InitialsAvatar } from "@/components/shared/initials-avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
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
import type { WorkspaceMember } from "@/types/api";
import type { AssignableRole } from "../api";
import {
  useCurrentMember,
  useMembers,
  useRemoveMember,
  useUpdateMemberRole,
} from "../hooks";

const ROLE_LABELS: Record<WorkspaceMember["role"], string> = {
  OWNER: "Owner",
  ADMIN: "Admin",
  AGENT: "Agent",
};

/** Mirrors the backend rules so forbidden actions are never rendered. */
function canManage(
  viewer: WorkspaceMember | undefined,
  target: WorkspaceMember,
): boolean {
  if (!viewer || viewer.role === "AGENT") return false;
  if (target.role === "OWNER" || target.userId === viewer.userId) return false;
  if (viewer.role === "ADMIN" && target.role !== "AGENT") return false;
  return true;
}

export function MembersTable() {
  const members = useMembers();
  const viewer = useCurrentMember();
  const updateRole = useUpdateMemberRole();
  const removeMember = useRemoveMember();
  const [memberToRemove, setMemberToRemove] = useState<WorkspaceMember | null>(
    null,
  );

  if (members.isPending) {
    return (
      <div className="space-y-2">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-14 w-full" />
        ))}
      </div>
    );
  }

  if (members.isError) {
    return <ErrorState error={members.error} onRetry={members.refetch} />;
  }

  if (members.data.length === 0) {
    return (
      <EmptyState
        icon={Users}
        title="No members yet"
        description="Invite teammates to collaborate in this workspace."
      />
    );
  }

  // Only the owner may change roles; admins can merely remove agents.
  const showActions = viewer?.role === "OWNER" || viewer?.role === "ADMIN";

  return (
    <>
      <div className="rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Member</TableHead>
              <TableHead>Role</TableHead>
              <TableHead>Joined</TableHead>
              {showActions && (
                <TableHead className="w-24 text-right">Actions</TableHead>
              )}
            </TableRow>
          </TableHeader>
          <TableBody>
            {members.data.map((member) => {
              const manageable = canManage(viewer, member);
              return (
                <TableRow key={member.id}>
                  <TableCell>
                    <div className="flex items-center gap-3">
                      <InitialsAvatar name={member.name} />
                      <div className="min-w-0">
                        <p className="truncate font-medium">
                          {member.name}
                          {viewer?.id === member.id && (
                            <span className="text-muted-foreground font-normal">
                              {" "}
                              (you)
                            </span>
                          )}
                        </p>
                        <p className="text-muted-foreground truncate text-sm">
                          {member.email}
                        </p>
                      </div>
                    </div>
                  </TableCell>
                  <TableCell>
                    {viewer?.role === "OWNER" && manageable ? (
                      <Select
                        value={member.role}
                        disabled={updateRole.isPending}
                        onValueChange={(role) =>
                          updateRole.mutate({
                            memberId: member.id,
                            role: role as AssignableRole,
                          })
                        }
                      >
                        <SelectTrigger
                          className="w-28"
                          aria-label={`Role for ${member.name}`}
                        >
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="ADMIN">Admin</SelectItem>
                          <SelectItem value="AGENT">Agent</SelectItem>
                        </SelectContent>
                      </Select>
                    ) : (
                      <Badge
                        variant={
                          member.role === "OWNER" ? "default" : "secondary"
                        }
                      >
                        {ROLE_LABELS[member.role]}
                      </Badge>
                    )}
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {format(new Date(member.joinedAt), "MMM d, yyyy")}
                  </TableCell>
                  {showActions && (
                    <TableCell className="text-right">
                      {manageable && (
                        <Button
                          variant="ghost"
                          size="icon"
                          aria-label={`Remove ${member.name}`}
                          onClick={() => setMemberToRemove(member)}
                        >
                          <Trash2 className="size-4" aria-hidden />
                        </Button>
                      )}
                    </TableCell>
                  )}
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>

      <Dialog
        open={memberToRemove !== null}
        onOpenChange={(open) => !open && setMemberToRemove(null)}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Remove member</DialogTitle>
            <DialogDescription>
              {memberToRemove
                ? `${memberToRemove.name} will lose access to this workspace immediately.`
                : null}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setMemberToRemove(null)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              disabled={removeMember.isPending}
              onClick={() => {
                if (!memberToRemove) return;
                removeMember.mutate(memberToRemove.id, {
                  onSettled: () => setMemberToRemove(null),
                });
              }}
            >
              {removeMember.isPending && <Loader2 className="animate-spin" />}
              Remove
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
