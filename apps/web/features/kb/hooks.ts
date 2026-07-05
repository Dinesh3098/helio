"use client";

import {
  keepPreviousData,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { toast } from "sonner";
import { getApiErrorMessage } from "@/lib/api/client";
import { queryKeys } from "@/lib/query/keys";
import { helpApi, kbApi, type ArticleListParams } from "./api";

// ---------- Dashboard: categories ----------

export function useKbCategories() {
  return useQuery({
    queryKey: queryKeys.kbCategories,
    queryFn: kbApi.listCategories,
  });
}

function useKbInvalidate() {
  const queryClient = useQueryClient();
  return () => queryClient.invalidateQueries({ queryKey: ["kb"] });
}

export function useCreateCategory() {
  const invalidate = useKbInvalidate();
  return useMutation({
    mutationFn: kbApi.createCategory,
    onSuccess: async () => {
      toast.success("Category created");
      await invalidate();
    },
  });
}

export function useUpdateCategory() {
  const invalidate = useKbInvalidate();
  return useMutation({
    mutationFn: kbApi.updateCategory,
    onSuccess: async () => {
      toast.success("Category updated");
      await invalidate();
    },
  });
}

export function useDeleteCategory() {
  const invalidate = useKbInvalidate();
  return useMutation({
    mutationFn: kbApi.deleteCategory,
    onSuccess: async () => {
      toast.success("Category deleted");
      await invalidate();
    },
    onError: (error) => toast.error(getApiErrorMessage(error)),
  });
}

// ---------- Dashboard: articles ----------

export function useKbArticles(params: ArticleListParams) {
  return useQuery({
    queryKey: queryKeys.kbArticles(params),
    queryFn: () => kbApi.listArticles(params),
    placeholderData: keepPreviousData,
  });
}

export function useKbArticle(id: string | null) {
  return useQuery({
    queryKey: queryKeys.kbArticle(id ?? ""),
    queryFn: () => kbApi.getArticle(id as string),
    enabled: id !== null,
  });
}

export function useCreateArticle() {
  const invalidate = useKbInvalidate();
  return useMutation({
    mutationFn: kbApi.createArticle,
    onSuccess: async () => {
      toast.success("Article created");
      await invalidate();
    },
  });
}

export function useUpdateArticle() {
  const invalidate = useKbInvalidate();
  return useMutation({
    mutationFn: kbApi.updateArticle,
    onSuccess: async () => {
      toast.success("Article saved");
      await invalidate();
    },
  });
}

export function useDeleteArticle() {
  const invalidate = useKbInvalidate();
  return useMutation({
    mutationFn: kbApi.deleteArticle,
    onSuccess: async () => {
      toast.success("Article deleted");
      await invalidate();
    },
    onError: (error) => toast.error(getApiErrorMessage(error)),
  });
}

// ---------- Public help center ----------

export function useHelpCenter(workspaceId: string | null) {
  return useQuery({
    queryKey: queryKeys.helpCenter(workspaceId ?? ""),
    queryFn: () => helpApi.getHelpCenter(workspaceId as string),
    enabled: workspaceId !== null,
    staleTime: 60_000,
  });
}

export function useHelpArticle(workspaceId: string | null, slug: string) {
  return useQuery({
    queryKey: queryKeys.helpArticle(workspaceId ?? "", slug),
    queryFn: () => helpApi.getArticle(workspaceId as string, slug),
    enabled: workspaceId !== null,
    staleTime: 60_000,
  });
}

export function useHelpSearch(workspaceId: string | null, q: string) {
  return useQuery({
    queryKey: queryKeys.helpSearch(workspaceId ?? "", q),
    queryFn: () => helpApi.search(workspaceId as string, q),
    enabled: workspaceId !== null && q.trim().length > 0,
    placeholderData: keepPreviousData,
  });
}
