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
}

export const useUiStore = create<UiState>((set) => ({
  sidebarCollapsed: false,
  toggleSidebar: () =>
    set((state) => ({ sidebarCollapsed: !state.sidebarCollapsed })),
  selectedConversationId: null,
  selectConversation: (id) =>
    set((state) => {
      if (!id) return { selectedConversationId: id };
      return {
        selectedConversationId: id,
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
