import { create } from "zustand";
import { persist } from "zustand/middleware";

/**
 * The active workspace — the tenant every API call is scoped to via the
 * x-workspace-id header (attached by the axios interceptor). Persisted so
 * a multi-workspace user keeps their choice across reloads. The dashboard
 * layout validates the stored id against /workspace/mine on boot and
 * replaces it if it's stale (e.g. the user was removed from it).
 */
interface WorkspaceState {
  activeWorkspaceId: string | null;
  setActiveWorkspace: (id: string) => void;
  clearActiveWorkspace: () => void;
}

export const useWorkspaceStore = create<WorkspaceState>()(
  persist(
    (set) => ({
      activeWorkspaceId: null,
      setActiveWorkspace: (id) => set({ activeWorkspaceId: id }),
      clearActiveWorkspace: () => set({ activeWorkspaceId: null }),
    }),
    { name: "helio.active-workspace" },
  ),
);
