import { api } from "@/lib/api/client";

export interface AiSummary {
  summary: string;
  model: string;
  updatedAt: string;
  /** True when messages arrived after this summary was generated. */
  stale: boolean;
}

export interface AiClassification {
  category: string;
  priority: "LOW" | "MEDIUM" | "HIGH";
  sentiment: "POSITIVE" | "NEUTRAL" | "NEGATIVE";
  intent: string;
}

export interface AiKbSuggestion {
  articleId: string;
  title: string;
  slug: string;
  reason: string;
}

export type RewriteStyle =
  | "PROFESSIONAL"
  | "FRIENDLY"
  | "SHORTER"
  | "LONGER"
  | "GRAMMAR";

export const aiApi = {
  /** null = no summary generated yet (backend 404). */
  getSummary: async (conversationId: string): Promise<AiSummary | null> => {
    try {
      return (
        await api.get<AiSummary>(`/ai/conversations/${conversationId}/summary`)
      ).data;
    } catch (error) {
      if (
        typeof error === "object" &&
        error !== null &&
        "response" in error &&
        (error as { response?: { status?: number } }).response?.status === 404
      ) {
        return null;
      }
      throw error;
    }
  },

  generateSummary: async (conversationId: string) =>
    (await api.post<AiSummary>(`/ai/conversations/${conversationId}/summary`))
      .data,

  suggestReply: async (conversationId: string, instructions?: string) =>
    (
      await api.post<{ text: string }>(
        `/ai/conversations/${conversationId}/reply`,
        { instructions: instructions || undefined },
      )
    ).data.text,

  rewrite: async (draft: string, style: RewriteStyle) =>
    (await api.post<{ text: string }>("/ai/rewrite", { draft, style })).data
      .text,

  classify: async (conversationId: string) =>
    (
      await api.post<AiClassification>(
        `/ai/conversations/${conversationId}/classify`,
      )
    ).data,

  suggestArticles: async (conversationId: string) =>
    (
      await api.post<AiKbSuggestion[]>(
        `/ai/conversations/${conversationId}/kb`,
      )
    ).data,
};
