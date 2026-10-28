// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";
import { Core } from "@blaze-cardano/sdk";
import { blockfrostFetch, BlockfrostError } from "./blockfrost";
import { resolveHandle } from "./handles";

vi.mock("./blockfrost", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./blockfrost")>()),
  blockfrostFetch: vi.fn(),
}));
const request = vi.mocked(blockfrostFetch);
const policy = "f0ff48bbb7bbe9d59a40f1ce90e9e9d0ff5002ec48f232b49ca0fb9a";
const name = "616c696365";
const address = Core.Address.fromBytes(
  Core.HexBlob("60" + "11".repeat(28)),
).toBech32();
const missing = () => new BlockfrostError("Not found", 404, "/asset");
beforeEach(() => request.mockReset());
function setup(find: (path: string) => unknown) {
  request.mockImplementation(async (path) => {
    if (path === "/api/v0/blocks/latest") return { slot: 100 };
    if (path === "/api/v0/genesis") return { network_magic: 2 };
    const result = find(path);
    if (result === undefined) throw missing();
    return result;
  });
}
describe("Dingo Handle lookup", () => {
  it("resolves CIP-68 Handle ownership without an external resolver", async () => {
    setup((path) =>
      path.includes(policy + "000de140" + name)
        ? [{ address, quantity: "1" }]
        : undefined,
    );
    expect(await resolveHandle("$Alice")).toBe(address);
    expect(
      request.mock.calls.every(([path]) => path.startsWith("/api/v0/")),
    ).toBe(true);
  });
  it("resolves classic Handle ownership", async () => {
    setup((path) =>
      path.includes(policy + name) ? [{ address, quantity: "1" }] : undefined,
    );
    expect(await resolveHandle("alice")).toBe(address);
  });
  it("does not select an arbitrary holder", async () => {
    setup((path) =>
      path.includes(policy + "000de140" + name)
        ? [
            { address, quantity: "1" },
            { address, quantity: "1" },
          ]
        : undefined,
    );
    await expect(resolveHandle("alice")).rejects.toThrow("ambiguous");
  });
  it("returns no result when neither token standard has a holder", async () => {
    setup(() => undefined);
    expect(await resolveHandle("alice")).toBeNull();
  });
  it("propagates unavailable Dingo data instead of treating it as no Handle", async () => {
    request.mockRejectedValue(
      new BlockfrostError("Unavailable", 503, "/health"),
    );
    await expect(resolveHandle("alice")).rejects.toThrow("Unavailable");
  });
  it("rejects an address from another network", async () => {
    const mainnet = Core.Address.fromBytes(
      Core.HexBlob("61" + "11".repeat(28)),
    ).toBech32();
    setup((path) =>
      path.includes(policy + "000de140" + name)
        ? [{ address: mainnet, quantity: "1" }]
        : undefined,
    );
    await expect(resolveHandle("alice")).rejects.toThrow("different network");
  });
});

describe("on-chain virtual Handles and policy lifecycle", () => {
  function dataMap(values: [string, Core.PlutusData][]) {
    const map = new Core.PlutusMap();
    for (const [key, value] of values)
      map.insert(
        Core.PlutusData.newBytes(new TextEncoder().encode(key)),
        value,
      );
    return Core.PlutusData.newMap(map);
  }
  it("reads the virtual Handle's resolution address instead of its script holder", async () => {
    const target = Core.PlutusData.newBytes(new TextEncoder().encode(address));
    const datum = dataMap([
      ["resolved_addresses", dataMap([["ada", target]])],
    ]).toCbor();
    const virtualName = "616c69636540686f6d65";
    const asset = policy + "00000000" + virtualName;
    const owner = Core.Address.fromBytes(
      Core.HexBlob("70" + "22".repeat(28)),
    ).toBech32();
    setup((path) =>
      path.includes("/utxos/" + asset)
        ? [{ inline_datum: datum, data_hash: null }]
        : path.includes("/assets/" + asset)
          ? [{ address: owner, quantity: "1" }]
          : undefined,
    );
    expect(await resolveHandle("alice@home")).toBe(address);
    expect(address).not.toBe(owner);
  });
  it("does not resolve a policy after its on-chain sunset slot", async () => {
    const registryName = "68616e646c655f706f6c6963696573";
    const settings = new Core.PlutusList();
    for (const value of [0n, 0n, 100n])
      settings.add(Core.PlutusData.newInteger(value));
    const map = new Core.PlutusMap();
    map.insert(
      Core.PlutusData.newBytes(
        Uint8Array.from(policy.match(/../g)!.map((byte) => parseInt(byte, 16))),
      ),
      Core.PlutusData.newList(settings),
    );
    const list = new Core.PlutusList();
    list.add(Core.PlutusData.newMap(map));
    const datum = Core.PlutusData.newList(list).toCbor();
    setup((path) =>
      path.includes("/utxos/" + policy + registryName)
        ? [{ inline_datum: datum, data_hash: null }]
        : path.includes("/assets/" + policy + registryName)
          ? [{ address, quantity: "1" }]
          : path.includes(policy + name)
            ? [{ address, quantity: "1" }]
            : undefined,
    );
    expect(await resolveHandle("alice")).toBeNull();
    expect(
      request.mock.calls.some(([path]) => path.includes(policy + name)),
    ).toBe(false);
  });
});
