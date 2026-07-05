"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { tokenStore } from "@/lib/auth/token-store";
import { queryKeys } from "@/lib/query/keys";
import type { AuthResponse } from "@/types/api";
import { authApi } from "./api";

/**
 * Session source of truth. On a fresh page load there is no in-memory
 * access token — the first /auth/me 401s and the axios interceptor
 * silently redeems the persisted refresh token, so this query resolves
 * whenever a valid session exists.
 */
export function useMe() {
  return useQuery({
    queryKey: queryKeys.me,
    queryFn: authApi.me,
    staleTime: Infinity,
    retry: false,
  });
}

function useAuthSuccess() {
  const queryClient = useQueryClient();
  const router = useRouter();
  return (response: AuthResponse) => {
    tokenStore.setTokens(response.accessToken, response.refreshToken);
    queryClient.setQueryData(queryKeys.me, response.user);
    router.replace("/inbox");
  };
}

export function useLogin() {
  const onAuth = useAuthSuccess();
  return useMutation({ mutationFn: authApi.login, onSuccess: onAuth });
}

export function useSignup() {
  const onAuth = useAuthSuccess();
  return useMutation({ mutationFn: authApi.signup, onSuccess: onAuth });
}

export function useLogout() {
  const queryClient = useQueryClient();
  const router = useRouter();
  return useMutation({
    mutationFn: async () => {
      const refreshToken = tokenStore.getRefreshToken();
      if (refreshToken) {
        await authApi.logout(refreshToken).catch(() => undefined);
      }
    },
    onSettled: () => {
      tokenStore.clear();
      queryClient.clear();
      router.replace("/login");
    },
  });
}
