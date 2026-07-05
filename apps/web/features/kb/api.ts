import { api } from "@/lib/api/client";
import type {
  KbArticle,
  KbArticleSummary,
  KbCategory,
  Paginated,
  PublicArticle,
  PublicArticleSummary,
  PublicHelpCenter,
} from "@/types/api";

export interface ArticleListParams {
  search?: string;
  categoryId?: string;
  published?: boolean;
  page: number;
}

export interface SaveArticleInput {
  title: string;
  content: string;
  excerpt?: string;
  categoryId: string;
  isPublished?: boolean;
}

export const kbApi = {
  listCategories: async () =>
    (await api.get<KbCategory[]>("/kb/categories")).data,

  createCategory: async (input: { name: string; displayOrder?: number }) =>
    (await api.post<KbCategory>("/kb/categories", input)).data,

  updateCategory: async ({
    id,
    ...input
  }: {
    id: string;
    name?: string;
    displayOrder?: number;
  }) => (await api.patch<KbCategory>(`/kb/categories/${id}`, input)).data,

  deleteCategory: async (id: string) => {
    await api.delete(`/kb/categories/${id}`);
  },

  listArticles: async (params: ArticleListParams) =>
    (
      await api.get<Paginated<KbArticleSummary>>("/kb/articles", {
        params: { ...params, search: params.search || undefined },
      })
    ).data,

  getArticle: async (id: string) =>
    (await api.get<KbArticle>(`/kb/articles/${id}`)).data,

  createArticle: async (input: SaveArticleInput) =>
    (await api.post<KbArticle>("/kb/articles", input)).data,

  updateArticle: async ({
    id,
    ...input
  }: Partial<SaveArticleInput> & { id: string }) =>
    (await api.patch<KbArticle>(`/kb/articles/${id}`, input)).data,

  deleteArticle: async (id: string) => {
    await api.delete(`/kb/articles/${id}`);
  },
};

/** Public help center — no auth, workspace passed explicitly. */
export const helpApi = {
  getHelpCenter: async (workspaceId: string) =>
    (await api.get<PublicHelpCenter>("/help", { params: { workspaceId } }))
      .data,

  getArticle: async (workspaceId: string, slug: string) =>
    (
      await api.get<PublicArticle>(`/help/articles/${slug}`, {
        params: { workspaceId },
      })
    ).data,

  search: async (workspaceId: string, q: string) =>
    (
      await api.get<PublicArticleSummary[]>("/help/search", {
        params: { workspaceId, q },
      })
    ).data,
};
