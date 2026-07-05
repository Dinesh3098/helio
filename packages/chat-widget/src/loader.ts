import { validateConfig, type HelioWidgetConfig } from "./shared/config";

/**
 * Embed entry point (`widget.js`). Kept dependency-free and tiny: it
 * draws the launcher inside a shadow root and injects `widget-app.js`
 * (Preact + Socket.IO) only when the visitor first opens the chat —
 * customer pages never pay for the full bundle up front.
 */

const APP_FILE = "widget-app.js";

// Captured at evaluation time; currentScript is null in later callbacks.
const loaderSrc =
  (document.currentScript as HTMLScriptElement | null)?.src ?? "";

const LAUNCHER_CSS = `
:host { all: initial; }
.helio-launcher {
  position: fixed;
  bottom: 20px;
  right: 20px;
  width: 56px;
  height: 56px;
  border: none;
  border-radius: 50%;
  background: #4f46e5;
  color: #fff;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.24);
  transition: transform 0.15s ease;
  z-index: 2147483000;
}
.helio-launcher:hover { transform: scale(1.06); }
.helio-launcher:focus-visible { outline: 3px solid #c7d2fe; outline-offset: 2px; }
.helio-launcher svg { width: 26px; height: 26px; }
.helio-launcher.loading { pointer-events: none; opacity: 0.75; }
.helio-launcher .spin {
  width: 22px; height: 22px;
  border: 3px solid rgba(255,255,255,0.4);
  border-top-color: #fff;
  border-radius: 50%;
  animation: helio-spin 0.7s linear infinite;
}
@keyframes helio-spin { to { transform: rotate(360deg); } }
`;

const CHAT_ICON = `<svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M4 5.5A2.5 2.5 0 0 1 6.5 3h11A2.5 2.5 0 0 1 20 5.5v8a2.5 2.5 0 0 1-2.5 2.5H9l-4.2 3.36A.5.5 0 0 1 4 18.97V5.5Z" fill="currentColor"/></svg>`;

let initialized = false;

function init(options: HelioWidgetConfig): void {
  if (initialized) {
    console.warn("[Helio] init() called twice — ignoring");
    return;
  }
  const config = validateConfig(options);
  initialized = true;

  const host = document.createElement("div");
  host.id = "helio-widget";
  const shadow = host.attachShadow({ mode: "open" });

  const style = document.createElement("style");
  style.textContent = LAUNCHER_CSS;
  shadow.appendChild(style);

  const button = document.createElement("button");
  button.type = "button";
  button.className = "helio-launcher";
  button.setAttribute("aria-label", "Open chat");
  button.innerHTML = CHAT_ICON;
  shadow.appendChild(button);
  document.body.appendChild(host);

  let loading = false;
  button.addEventListener("click", () => {
    if (loading) return;
    loading = true;
    button.classList.add("loading");
    button.innerHTML = `<span class="spin" role="status" aria-label="Loading chat"></span>`;

    const script = document.createElement("script");
    script.src = loaderSrc
      ? loaderSrc.replace(/[^/]*$/, APP_FILE)
      : APP_FILE;
    script.async = true;
    script.onload = () => {
      if (window.__HELIO_MOUNT__) {
        // The app takes over the shadow root entirely (its own launcher,
        // panel, styles) and opens immediately.
        window.__HELIO_MOUNT__(config, shadow);
      }
    };
    script.onerror = () => {
      loading = false;
      button.classList.remove("loading");
      button.innerHTML = CHAT_ICON;
      console.error("[Helio] failed to load the chat widget");
    };
    document.head.appendChild(script);
  });
}

window.Helio = { init };
