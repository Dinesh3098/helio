import { nextJsConfig } from "@helio/config/eslint/next";

/** @type {import("eslint").Linter.Config[]} */
export default [
  // Widget bundles copied in by @helio/chat-widget's build for /demo.
  { ignores: ["public/widget.js", "public/widget-app.js"] },
  ...nextJsConfig,
];
