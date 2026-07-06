import { beforeEach, describe, expect, it } from "vitest";
import { useUiStore } from "./ui-store";

const initial = useUiStore.getState();

describe("useUiStore", () => {
  beforeEach(() => {
    useUiStore.setState(initial, true);
  });

  it("toggles the sidebar", () => {
    expect(useUiStore.getState().sidebarCollapsed).toBe(false);
    useUiStore.getState().toggleSidebar();
    expect(useUiStore.getState().sidebarCollapsed).toBe(true);
  });

  it("clears the composer draft when switching conversations", () => {
    useUiStore.getState().selectConversation("conv-1");
    useUiStore.getState().setComposerDraft("half-typed reply");
    useUiStore.getState().selectConversation("conv-2");
    expect(useUiStore.getState().composerDraft).toBe("");
    expect(useUiStore.getState().selectedConversationId).toBe("conv-2");
  });

  it("clears unread count for a conversation when it is opened", () => {
    useUiStore.getState().incrementUnread("conv-9");
    useUiStore.getState().incrementUnread("conv-9");
    expect(useUiStore.getState().unreadCounts["conv-9"]).toBe(2);
    useUiStore.getState().selectConversation("conv-9");
    expect(useUiStore.getState().unreadCounts["conv-9"]).toBeUndefined();
  });
});
