import { fileURLToPath, URL } from "node:url";
import { defineConfig } from "vite";
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
});
