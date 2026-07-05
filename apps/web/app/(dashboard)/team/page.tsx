"use client";

import { PageHeader } from "@/components/shared/page-header";
import { InviteMemberDialog } from "@/features/workspace/components/invite-member-dialog";
import { MembersTable } from "@/features/workspace/components/members-table";
import { useCurrentMember } from "@/features/workspace/hooks";

export default function TeamPage() {
  const viewer = useCurrentMember();
  const canInvite = viewer?.role === "OWNER" || viewer?.role === "ADMIN";

  return (
    <div className="mx-auto max-w-5xl space-y-6 p-6">
      <PageHeader
        title="Team"
        description="Manage who has access to this workspace."
        actions={
          canInvite ? (
            <InviteMemberDialog canInviteAdmin={viewer?.role === "OWNER"} />
          ) : undefined
        }
      />
      <MembersTable />
    </div>
  );
}
