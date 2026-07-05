"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { useMe } from "@/features/auth/hooks";
import { getApiErrorMessage } from "@/lib/api/client";
import { queryKeys } from "@/lib/query/keys";
import { membersApi, workspaceApi } from "./api";

export function useWorkspace() {
  return useQuery({ queryKey: queryKeys.workspace, queryFn: workspaceApi.get });
}

export function useUpdateWorkspace() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: workspaceApi.update,
    onSuccess: (workspace) => {
      queryClient.setQueryData(queryKeys.workspace, workspace);
      toast.success("Workspace updated");
    },
    onError: (error) => toast.error(getApiErrorMessage(error)),
  });
}

export function useMembers() {
  return useQuery({ queryKey: queryKeys.members, queryFn: membersApi.list });
}

/**
 * The viewer's own membership. The backend keeps roles out of the JWT, so
 * the members list (readable by every role) is the only place the frontend
 * can learn its role for RBAC-aware rendering.
 */
export function useCurrentMember() {
  const { data: me } = useMe();
  const { data: members } = useMembers();
  return members?.find((member) => member.userId === me?.id);
}

export function useInviteMember() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: membersApi.invite,
    onSuccess: async () => {
      toast.success("Member added to the workspace");
      await queryClient.invalidateQueries({ queryKey: queryKeys.members });
    },
  });
}

export function useUpdateMemberRole() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: membersApi.updateRole,
    onSuccess: async () => {
      toast.success("Role updated");
      await queryClient.invalidateQueries({ queryKey: queryKeys.members });
    },
    onError: (error) => toast.error(getApiErrorMessage(error)),
  });
}

export function useRemoveMember() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: membersApi.remove,
    onSuccess: async () => {
      toast.success("Member removed");
      await queryClient.invalidateQueries({ queryKey: queryKeys.members });
    },
    onError: (error) => toast.error(getApiErrorMessage(error)),
  });
}
