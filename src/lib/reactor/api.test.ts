// @vitest-environment node
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { readBridgeSettings, readBridgeTransfer } from "./api";
const network = vi.hoisted(() => ({ id: "prime-testnet", networkMagic: 3311 }));
vi.mock("../dingo/config", () => ({ DINGO_NETWORK: network }));
const raw = { enabledChains: ["prime", "vector", "nexus"], bridgingSettings: { minValueToBridge: 1000000, maxAmountAllowedToBridge: 1000000000000, minChainFeeForBridging: { prime: 1000010 }, allowedDirections: { prime: ["vector", "nexus", "unknown"] } } };
beforeEach(() => Object.assign(network, { id: "prime-testnet", networkMagic: 3311 }));
afterEach(() => vi.restoreAllMocks());
it("reads live routes, exact base units and validator availability", async () => {
  vi.spyOn(globalThis, "fetch").mockImplementation(async (url) => Response.json(String(url).includes("validators") ? { inProgress: true } : raw));
  expect(await readBridgeSettings()).toEqual({ minimum: 1000000n, maximum: 1000000000000n, fee: 1000010n, paused: true, destinations: ["vector", "nexus"] });
});
it("rejects another network before requesting bridge data", async () => {
  network.id = "preview";
  const fetch = vi.spyOn(globalThis, "fetch");
  await expect(readBridgeSettings()).rejects.toThrow("Prime Testnet");
  expect(fetch).not.toHaveBeenCalled();
});
it("keeps not indexed, delivery failure, unknown status and mismatched transfers distinct", async () => {
  const hash = "ab".repeat(32);
  const fetch = vi.spyOn(globalThis, "fetch").mockImplementation(async () => new Response("", { status: 404 }));
  expect(await readBridgeTransfer(hash)).toBeNull();
  fetch.mockImplementation(async () => Response.json({ originChain: "prime", sourceTxHash: hash, destinationChain: "nexus", status: "FailedToExecuteOnDestination" }));
  expect(await readBridgeTransfer(hash)).toMatchObject({ status: "FailedToExecuteOnDestination" });
  fetch.mockImplementation(async () => Response.json({ originChain: "prime", sourceTxHash: hash, destinationChain: "vector", status: "FutureStatus" }));
  expect(await readBridgeTransfer(hash)).toMatchObject({ status: "FutureStatus" });
  fetch.mockImplementation(async () => Response.json({ originChain: "vector", sourceTxHash: hash, destinationChain: "nexus", status: "ExecutedOnDestination" }));
  await expect(readBridgeTransfer(hash)).rejects.toThrow("does not match");
  await expect(readBridgeTransfer("../settings")).rejects.toThrow("64-character");
});
it("does not treat unsafe numeric limits as usable bridge settings", async () => {
  vi.spyOn(globalThis, "fetch").mockImplementation(async (url) => Response.json(String(url).includes("validators") ? { inProgress: false } : { ...raw, bridgingSettings: { ...raw.bridgingSettings, minValueToBridge: Number.MAX_SAFE_INTEGER + 1 } }));
  await expect(readBridgeSettings()).rejects.toThrow("invalid AP3X");
});
