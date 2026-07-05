import { render } from "preact";
import type { HelioWidgetConfig } from "../shared/config";
import styles from "./styles.css?inline";
import { Widget } from "./widget";

/**
 * App entry (`widget-app.js`), injected by the loader on first open. It
 * takes over the loader's shadow root: styles live inside the shadow
 * boundary, so host-page CSS cannot leak in and widget CSS cannot leak
 * out.
 */
window.__HELIO_MOUNT__ = (
  config: HelioWidgetConfig,
  shadowRoot: ShadowRoot,
): void => {
  shadowRoot.innerHTML = "";

  const style = document.createElement("style");
  style.textContent = styles;
  shadowRoot.appendChild(style);

  const root = document.createElement("div");
  shadowRoot.appendChild(root);

  render(<Widget config={config} />, root);
};
