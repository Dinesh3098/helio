/** Options accepted by window.Helio.init(). */
export interface HelioWidgetConfig {
  /** Workspace the widget belongs to (uuid). */
  workspaceId: string;
  /** Helio API origin, e.g. https://api.example.com */
  apiUrl: string;
  /** Socket.IO origin; defaults to apiUrl. */
  socketUrl?: string;
}

export function validateConfig(input: unknown): HelioWidgetConfig {
  const config = input as Partial<HelioWidgetConfig> | undefined;
  if (!config || typeof config !== "object") {
    throw new Error("[Helio] init(options) requires an options object");
  }
  if (typeof config.workspaceId !== "string" || !config.workspaceId) {
    throw new Error("[Helio] init: workspaceId is required");
  }
  if (typeof config.apiUrl !== "string" || !config.apiUrl) {
    throw new Error("[Helio] init: apiUrl is required");
  }
  return {
    workspaceId: config.workspaceId,
    apiUrl: config.apiUrl.replace(/\/$/, ""),
    socketUrl: config.socketUrl?.replace(/\/$/, ""),
  };
}

declare global {
  interface Window {
    Helio?: { init: (options: HelioWidgetConfig) => void };
    /** Set by widget-app.js; called by the loader after injection. */
    __HELIO_MOUNT__?: (
      config: HelioWidgetConfig,
      shadowRoot: ShadowRoot,
    ) => void;
  }
}
