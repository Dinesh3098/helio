import { create } from "zustand";

/**
 * UI-only state. Server data (conversations, contacts, …) lives in React
 * Query — never duplicate it here. Unread counts are client-side UI hints
 * fed by realtime events, not server state.
 */
interface UiState {
  sidebarCollapsed: boolean;
  toggleSidebar: () => void;
  selectedConversationId: string | null;
  selectConversation: (id: string | null) => void;
  unreadCounts: Record<string, number>;
  incrementUnread: (conversationId: string) => void;
  clearUnread: (conversationId: string) => void;
  /**
   * Composer draft for the open conversation. Lives here (not in the
   * composer) so the AI panel can insert suggestions and rewrite it.
   */
  composerDraft: string;
  setComposerDraft: (draft: string) => void;
  aiPanelOpen: boolean;
  toggleAiPanel: () => void;
}

export const useUiStore = create<UiState>((set) => ({
  sidebarCollapsed: false,
  toggleSidebar: () =>
    set((state) => ({ sidebarCollapsed: !state.sidebarCollapsed })),
  selectedConversationId: null,
  selectConversation: (id) =>
    set((state) => {
      if (id === state.selectedConversationId) return state;
      // A draft never follows you to another conversation.
      if (!id) return { selectedConversationId: id, composerDraft: "" };
      return {
        selectedConversationId: id,
        composerDraft: "",
        unreadCounts: withoutKey(state.unreadCounts, id),
      };
    }),
  unreadCounts: {},
  incrementUnread: (conversationId) =>
    set((state) => ({
      unreadCounts: {
        ...state.unreadCounts,
        [conversationId]: (state.unreadCounts[conversationId] ?? 0) + 1,
      },
    })),
  clearUnread: (conversationId) =>
    set((state) => ({
      unreadCounts: withoutKey(state.unreadCounts, conversationId),
    })),
  composerDraft: "",
  setComposerDraft: (draft) => set({ composerDraft: draft }),
  aiPanelOpen: false,
  toggleAiPanel: () => set((state) => ({ aiPanelOpen: !state.aiPanelOpen })),
}));

function withoutKey(
  counts: Record<string, number>,
  key: string,
): Record<string, number> {
  if (!(key in counts)) return counts;
  const next = { ...counts };
  delete next[key];
  return next;
}
