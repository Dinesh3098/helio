import preact from "@preact/preset-vite";
import { defineConfig } from "vite";

/** The full widget app, lazy-loaded by the loader on first open. */
export default defineConfig({
  plugins: [preact()],
  build: {
    lib: {
      entry: "src/app/main.tsx",
      formats: ["iife"],
      name: "HelioWidgetApp",
      fileName: () => "widget-app.js",
    },
    outDir: "dist",
    emptyOutDir: false,
    target: "es2019",
  },
  define: {
    "process.env.NODE_ENV": JSON.stringify("production"),
  },
});
