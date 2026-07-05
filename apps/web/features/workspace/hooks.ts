"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";
import { toast } from "sonner";
import { useMe } from "@/features/auth/hooks";
import { getApiErrorMessage } from "@/lib/api/client";
import { queryKeys } from "@/lib/query/keys";
import { useUiStore } from "@/stores/ui-store";
import { useWorkspaceStore } from "@/stores/workspace-store";
import { membersApi, workspaceApi } from "./api";

export function useMyWorkspaces(enabled = true) {
  return useQuery({
    queryKey: queryKeys.myWorkspaces,
    queryFn: workspaceApi.mine,
    enabled,
    staleTime: 60_000,
  });
}

/**
 * Resolves the active workspace before workspace-scoped queries run:
 * keeps a persisted choice if it's still in the membership list,
 * otherwise falls back to the first workspace. Returns false until the
 * x-workspace-id header is guaranteed valid — the dashboard renders a
 * skeleton meanwhile, so no request ever fires without tenant context.
 */
export function useWorkspaceBootstrap(enabled: boolean): boolean {
  const workspaces = useMyWorkspaces(enabled);
  const activeWorkspaceId = useWorkspaceStore((s) => s.activeWorkspaceId);
  const setActiveWorkspace = useWorkspaceStore((s) => s.setActiveWorkspace);

  const list = workspaces.data;
  const isValid =
    !!list && list.some((w) => w.workspaceId === activeWorkspaceId);

  useEffect(() => {
    if (!list || list.length === 0 || isValid) return;
    const first = list[0];
    if (first) setActiveWorkspace(first.workspaceId);
  }, [list, isValid, setActiveWorkspace]);

  return isValid;
}

/** Switches tenant: new header value, then every cached query is stale. */
export function useSwitchWorkspace() {
  const queryClient = useQueryClient();
  const setActiveWorkspace = useWorkspaceStore((s) => s.setActiveWorkspace);
  const selectConversation = useUiStore((s) => s.selectConversation);

  return (workspaceId: string) => {
    if (useWorkspaceStore.getState().activeWorkspaceId === workspaceId) return;
    setActiveWorkspace(workspaceId);
    selectConversation(null);
    queryClient.clear();
  };
}

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
