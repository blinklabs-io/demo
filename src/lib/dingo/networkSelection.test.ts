import { afterEach, expect, it, vi } from "vitest";
import { changeDingoNetwork, networkDestination } from "./networkSelection";
const boundary = vi.hoisted(() => ({ events: [] as string[] }));
vi.mock("./config", () => ({ DINGO_NETWORK: { id: "preview" } }));
vi.mock("../../stores/walletStore", () => ({ useWalletStore: { getState: () => ({ disconnect: () => boundary.events.push("disconnect") }) } }));
vi.mock("../../stores/tipStore", () => ({ useTipStore: { getState: () => ({ stop: () => boundary.events.push("stop-tip") }) } }));
vi.mock("../../stores/mempoolStore", () => ({ useMempoolStore: { getState: () => ({ stop: () => boundary.events.push("stop-mempool") }) } }));
afterEach(() => { vi.unstubAllGlobals(); boundary.events = []; });
it("disconnects and stops both streams synchronously before persisting and navigating", () => {
  vi.stubGlobal("window", {
    localStorage: { setItem: (key: string, value: string) => boundary.events.push(`${key}=${value}`) },
    location: { pathname: "/wallet/swap", assign: (path: string) => boundary.events.push(`navigate:${path}`) },
  });
  changeDingoNetwork("preprod");
  expect(boundary.events).toEqual(["disconnect", "stop-tip", "stop-mempool", "dingo.network=preprod", "navigate:/wallet/swap?network=preprod"]);
});
it("leaves the current chain intact when selecting it again", () => {
  changeDingoNetwork("preview");
  expect(boundary.events).toEqual([]);
});

it.each([
  ["/wallet/tools/transactions", "/wallet/tools/transactions"],
  ["/wallet/delegate?drep=old", "/wallet/delegate"],
  ["/explorer/proposal/old", "/explorer/governance"],
  ["/explorer/surveys/old/0", "/explorer/surveys"],
  ["/explorer/surveys/new", "/explorer/surveys/new"],
  ["/explorer/drep/old", "/explorer/dreps"],
  ["/explorer/pool/old", "/explorer/pools"],
  ["/explorer/epoch/100", "/explorer/epoch"],
  ["/explorer/tx/old", "/explorer"],
  ["/wallet/tools/unknown", "/"],
  ["/unknown", "/"],
])("switches %s to its network-independent destination %s", (path, expected) => {
  expect(networkDestination(path)).toBe(expected);
});
