import { afterEach, beforeEach, expect, it, vi } from "vitest";

beforeEach(() => {
  window.history.replaceState(null, "", "/");
  localStorage.clear();
  vi.resetModules();
});
afterEach(() => {
  window.history.replaceState(null, "", "/");
  localStorage.clear();
  vi.unstubAllEnvs();
  vi.resetModules();
});
it("defaults to Preview only when no network is saved and stays immutable per page", async () => {
  const { DINGO_NETWORK } = await import("./config");
  expect(DINGO_NETWORK).toEqual({
    id: "preview",
    label: "Preview",
    networkMagic: 2,
  });
  localStorage.setItem("dingo.network", "preprod");
  expect(DINGO_NETWORK.id).toBe("preview");
});
it("selects Preprod endpoints and network magic without borrowing Preview overrides", async () => {
  localStorage.setItem("dingo.network", "preprod");
  vi.stubEnv("VITE_DINGO_BLOCKFROST_URL", "https://preview.invalid");
  const { DINGO_NETWORK, DINGO_CONFIG } = await import("./config");
  expect(DINGO_NETWORK).toEqual({
    id: "preprod",
    label: "Preprod",
    networkMagic: 1,
  });
  expect(DINGO_CONFIG.blockfrostUrl).toBe(
    "https://dingo.preprod.blinklabs.cloud",
  );
  expect(DINGO_CONFIG.utxorpcUrl).toBe(
    "https://dingo.preprod.blinklabs.cloud:9090",
  );
  expect(DINGO_CONFIG.meshUrl).toBe(
    "https://dingo.preprod.blinklabs.cloud:8080",
  );
});
it("honors separate Preprod overrides", async () => {
  localStorage.setItem("dingo.network", "preprod");
  vi.stubEnv("VITE_DINGO_PREPROD_BLOCKFROST_URL", "https://rest.invalid/");
  vi.stubEnv("VITE_DINGO_PREPROD_UTXORPC_URL", "https://rpc.invalid/");
  vi.stubEnv("VITE_DINGO_PREPROD_MESH_URL", "https://mesh.invalid/");
  const { DINGO_CONFIG } = await import("./config");
  expect(DINGO_CONFIG).toEqual({
    blockfrostUrl: "https://rest.invalid",
    utxorpcUrl: "https://rpc.invalid",
    meshUrl: "https://mesh.invalid",
  });
});
it("rejects an invalid persisted selection instead of silently selecting another chain", async () => {
  localStorage.setItem("dingo.network", "mainnet");
  await expect(import("./config")).rejects.toThrow(
    "Unsupported saved Dingo network",
  );
});

it("uses explicit Preprod URL context before a conflicting saved selection", async () => {
  localStorage.setItem("dingo.network", "preview");
  window.history.replaceState(null, "", "/explorer/tx/shared?network=preprod");
  const { DINGO_NETWORK, DINGO_CONFIG } = await import("./config");
  expect(DINGO_NETWORK.networkMagic).toBe(1);
  expect(DINGO_CONFIG.blockfrostUrl).toContain("preprod");
  expect(fetch).not.toHaveBeenCalled();
});
it.each(["mainnet", "", "preview&network=preprod"])(
  "rejects invalid URL network %s despite valid saved context",
  async (value) => {
    localStorage.setItem("dingo.network", "preview");
    window.history.replaceState(null, "", `/explorer?network=${value}`);
    await expect(import("./config")).rejects.toThrow(
      "valid network in the URL",
    );
  },
);

it("selects Musashi independently of Preview and Preprod overrides", async () => {
  window.history.replaceState(null, "", "/explorer/leios?network=musashi");
  vi.stubEnv("VITE_DINGO_BLOCKFROST_URL", "https://preview.invalid");
  vi.stubEnv("VITE_DINGO_PREPROD_BLOCKFROST_URL", "https://preprod.invalid");
  const { DINGO_NETWORK, DINGO_CONFIG } = await import("./config");
  expect(DINGO_NETWORK).toEqual({
    id: "musashi",
    label: "Musashi",
    networkMagic: 164,
  });
  expect(DINGO_CONFIG.blockfrostUrl).toBe(
    "https://dingo.musashi.blinklabs.cloud",
  );
  expect(DINGO_CONFIG.utxorpcUrl).toBe(
    "https://dingo.musashi.blinklabs.cloud:9090",
  );
  expect(DINGO_CONFIG.meshUrl).toBe(
    "https://dingo.musashi.blinklabs.cloud:8080",
  );
});
it("honors independent Musashi endpoint overrides", async () => {
  window.history.replaceState(null, "", "/explorer/leios?network=musashi");
  vi.stubEnv(
    "VITE_DINGO_MUSASHI_BLOCKFROST_URL",
    "https://musashi-rest.invalid/",
  );
  vi.stubEnv("VITE_DINGO_MUSASHI_UTXORPC_URL", "https://musashi-rpc.invalid/");
  vi.stubEnv("VITE_DINGO_MUSASHI_MESH_URL", "https://musashi-mesh.invalid/");
  const { DINGO_CONFIG } = await import("./config");
  expect(DINGO_CONFIG).toEqual({
    blockfrostUrl: "https://musashi-rest.invalid",
    utxorpcUrl: "https://musashi-rpc.invalid",
    meshUrl: "https://musashi-mesh.invalid",
  });
});
