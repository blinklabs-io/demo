import { afterEach, expect, it, vi } from "vitest";
import {
  changeDingoNetwork,
  networkDestination,
  networkSwitchDestination,
} from "./networkSelection";
const boundary = vi.hoisted(() => ({ events: [] as string[] }));
vi.mock("./config", () => ({ DINGO_NETWORK: { id: "preview" } }));
vi.mock("../../stores/walletStore", () => ({
  useWalletStore: {
    getState: () => ({ disconnect: () => boundary.events.push("disconnect") }),
  },
}));
vi.mock("../../stores/tipStore", () => ({
  useTipStore: {
    getState: () => ({ stop: () => boundary.events.push("stop-tip") }),
  },
}));
vi.mock("../../stores/mempoolStore", () => ({
  useMempoolStore: {
    getState: () => ({ stop: () => boundary.events.push("stop-mempool") }),
  },
}));
afterEach(() => {
  vi.unstubAllGlobals();
  boundary.events = [];
});
it("disconnects and stops both streams synchronously before persisting and navigating", () => {
  vi.stubGlobal("window", {
    localStorage: {
      setItem: (key: string, value: string) =>
        boundary.events.push(`${key}=${value}`),
    },
    location: {
      pathname: "/wallet/swap",
      search: "",
      hash: "",
      assign: (path: string) => boundary.events.push(`navigate:${path}`),
    },
  });
  changeDingoNetwork("preprod");
  expect(boundary.events).toEqual([
    "disconnect",
    "stop-tip",
    "stop-mempool",
    "dingo.network=preprod",
    "navigate:/wallet/swap?network=preprod",
  ]);
});
it("leaves the current chain intact when selecting it again", () => {
  changeDingoNetwork("preview");
  expect(boundary.events).toEqual([]);
});

it.each([
  ["/wallet/bridge", "/wallet/bridge"],
  ["/wallet/fluidtokens", "/wallet/fluidtokens"],
  ["/wallet/dano", "/wallet/dano"],
  ["/wallet/splash", "/wallet/splash"],
  ["/explorer/leios", "/explorer/leios"],
  ["/explorer/track", "/explorer/track"],
  ["/explorer/track/old", "/explorer/track"],
  ["/wallet/tools/data", "/wallet/tools/data"],
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
])(
  "switches %s to its network-independent destination %s",
  (path, expected) => {
    expect(networkDestination(path)).toBe(expected);
  },
);

it("navigates using explicit URL context even when persistence is blocked", () => {
  vi.stubGlobal("window", {
    localStorage: {
      setItem: () => {
        boundary.events.push("persistence-blocked");
        throw new Error("Storage blocked");
      },
    },
    location: {
      pathname: "/wallet/swap",
      search: "?network=preview",
      hash: "#market",
      assign: (path: string) => boundary.events.push(`navigate:${path}`),
    },
  });
  expect(() => changeDingoNetwork("preprod")).not.toThrow();
  expect(boundary.events).toEqual([
    "disconnect",
    "stop-tip",
    "stop-mempool",
    "persistence-blocked",
    "navigate:/wallet/swap?network=preprod#market",
  ]);
});
it.each([
  [
    "/explorer/pools",
    "?network=preview&ticker=BLINK",
    "#results",
    "/explorer/pools?ticker=BLINK&network=preprod#results",
  ],
  [
    "/wallet/delegate",
    "?pool=pool1old&drep=drep1old&network=preview",
    "#review",
    "/wallet/delegate?network=preprod#review",
  ],
  [
    "/explorer/pool/old",
    "?ticker=BLINK&network=preview",
    "#stake",
    "/explorer/pools?network=preprod",
  ],
  [
    "/wallet/tools/transactions",
    "?address=addr_test1old",
    "#inspect",
    "/wallet/tools/transactions?network=preprod#inspect",
  ],
])(
  "preserves safe destination context for %s",
  (path, search, hash, expected) => {
    expect(networkSwitchDestination(path, search, hash, "preprod")).toBe(
      expected,
    );
  },
);

it("switches to Musashi with network-specific entity details removed", () => {
  expect(
    networkSwitchDestination(
      "/explorer/tx/old",
      "?network=preview",
      "#outputs",
      "musashi",
    ),
  ).toBe("/explorer?network=musashi");
  expect(
    networkSwitchDestination(
      "/explorer/leios",
      "?network=preview",
      "",
      "musashi",
    ),
  ).toBe("/explorer/leios?network=musashi");
});
