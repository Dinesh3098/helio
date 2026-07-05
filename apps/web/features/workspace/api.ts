import { api } from "@/lib/api/client";
import type { Workspace, WorkspaceMember, WorkspaceRole } from "@/types/api";

/** OWNER is never assignable through the API. */
export type AssignableRole = Exclude<WorkspaceRole, "OWNER">;

export interface InviteMemberInput {
  email: string;
  role: AssignableRole;
}

export const workspaceApi = {
  get: async () => (await api.get<Workspace>("/workspace")).data,

  update: async (input: { name: string }) =>
    (await api.patch<Workspace>("/workspace", input)).data,
};

export const membersApi = {
  list: async () =>
    (await api.get<WorkspaceMember[]>("/workspace/members")).data,

  invite: async (input: InviteMemberInput) =>
    (await api.post<WorkspaceMember>("/workspace/members", input)).data,

  updateRole: async (input: { memberId: string; role: AssignableRole }) =>
    (
      await api.patch<WorkspaceMember>(`/workspace/members/${input.memberId}`, {
        role: input.role,
      })
    ).data,

  remove: async (memberId: string) => {
    await api.delete(`/workspace/members/${memberId}`);
  },
};
