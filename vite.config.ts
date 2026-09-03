/// <reference types="vitest" />
import { fileURLToPath, URL } from "node:url";
import { defineConfig } from "vitest/config";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { nodePolyfills } from "vite-plugin-node-polyfills";

const messageSigningShim = fileURLToPath(
  new URL("./src/shims/cardanoMessageSigning.ts", import.meta.url),
);

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    nodePolyfills({
      include: ["buffer", "process", "util"],
      globals: {
        Buffer: true,
        global: true,
        process: true,
      },
    }),
  ],
  define: {
    global: "globalThis",
  },
  resolve: {
    alias: {
      "@emurgo/cardano-message-signing-browser": messageSigningShim,
      "@emurgo/cardano-message-signing-nodejs": messageSigningShim,
    },
  },
  test: {
    globals: true,
    environment: "jsdom",
    setupFiles: ["./src/test/setup.ts"],
    css: true,
    server: {
      // @sundaeswap/core's ESM build has a directory import Node's native
      // ESM resolver rejects; routing it through Vite's transform (as the
      // app build already does) resolves it the same way `vite build` does.
      deps: { inline: ["@sundaeswap/core"] },
    },
    coverage: {
      reporter: ["text", "json", "html"],
      exclude: [
        "node_modules/",
        "src/test/",
        "**/*.d.ts",
        "**/*.config.*",
        "dist/",
      ],
    },
  },
});
