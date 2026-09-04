// Single source of truth for where the app finds Dingo. Set at build time via
// Cloudflare Pages environment variables; defaults match Dingo's own defaults
// for a locally-run node (`npm run dev` against `dingo` started locally).
export const DINGO_CONFIG = {
  blockfrostUrl: (
    import.meta.env.VITE_DINGO_BLOCKFROST_URL || "http://127.0.0.1:3000"
  ).replace(/\/$/, ""),
  utxorpcUrl: (
    import.meta.env.VITE_DINGO_UTXORPC_URL || "http://127.0.0.1:9090"
  ).replace(/\/$/, ""),
};
