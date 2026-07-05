import { defineConfig } from "vite";

/**
 * The loader is the only script customer pages pay for on load: a few KB
 * of vanilla TS that draws the launcher and injects widget-app.js (Preact
 * + Socket.IO) on first open.
 */
export default defineConfig({
  build: {
    lib: {
      entry: "src/loader.ts",
      formats: ["iife"],
      name: "HelioWidgetLoader",
      fileName: () => "widget.js",
    },
    outDir: "dist",
    emptyOutDir: true,
    target: "es2019",
  },
});
