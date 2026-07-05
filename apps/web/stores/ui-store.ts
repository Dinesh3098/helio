import { create } from "zustand";

/**
 * UI-only state. Server data (conversations, contacts, …) lives in React
 * Query — never duplicate it here.
 */
interface UiState {
  sidebarCollapsed: boolean;
  toggleSidebar: () => void;
  selectedConversationId: string | null;
  selectConversation: (id: string | null) => void;
}

export const useUiStore = create<UiState>((set) => ({
  sidebarCollapsed: false,
  toggleSidebar: () =>
    set((state) => ({ sidebarCollapsed: !state.sidebarCollapsed })),
  selectedConversationId: null,
  selectConversation: (id) => set({ selectedConversationId: id }),
}));
