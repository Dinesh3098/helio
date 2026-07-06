import { beforeEach, describe, expect, it } from "vitest";
import { useWorkspaceStore } from "./workspace-store";

describe("useWorkspaceStore", () => {
  beforeEach(() => {
    window.localStorage.clear();
    useWorkspaceStore.setState({ activeWorkspaceId: null });
  });

  it("sets and clears the active workspace", () => {
    useWorkspaceStore.getState().setActiveWorkspace("ws-1");
    expect(useWorkspaceStore.getState().activeWorkspaceId).toBe("ws-1");

    useWorkspaceStore.getState().clearActiveWorkspace();
    expect(useWorkspaceStore.getState().activeWorkspaceId).toBeNull();
  });

  it("persists the choice under the helio.active-workspace key", () => {
    useWorkspaceStore.getState().setActiveWorkspace("ws-42");
    const raw = window.localStorage.getItem("helio.active-workspace");
    expect(raw).toBeTruthy();
    expect(JSON.parse(raw as string).state.activeWorkspaceId).toBe("ws-42");
  });
});
