// @vitest-environment node
import { beforeAll, beforeEach, afterEach, expect, it, vi } from "vitest";
import { Core } from "@blaze-cardano/sdk";
import { EContractVersion } from "@sundaeswap/core";
import { DingoSundaeQueryProvider } from "./dingoQueryProvider";
import { discoverV4Pools } from "./v4";
import poolFixture from "./mainnet-pool.fixture.json";
import { POOL_PRESETS } from "./protocol";
import type { DingoProvider } from "../dingo/utxorpc/provider";

const mocks = vi.hoisted(() => ({ search: vi.fn() }));
vi.mock("../dingo/config", () => ({
  DINGO_NETWORK: { id: "mainnet", label: "Mainnet", networkMagic: 764824073 },
  DINGO_CONFIG: { blockfrostUrl: "http://localhost:3000", utxorpcUrl: "http://localhost:9090", meshUrl: "http://localhost:8080" },
}));
vi.mock("../dingo/utxorpc/provider", () => ({
  getDingoProvider: () => ({ queryClient: { inner: { searchUtxos: mocks.search } } }),
  assertDingoNetwork: vi.fn(),
}));
beforeAll(async () => { await Core.initCrypto(); });
beforeEach(() => { mocks.search.mockReset(); vi.spyOn(console, "warn").mockImplementation(() => {}); });
afterEach(() => { vi.restoreAllMocks(); });

it("constructs a mainnet V3 provider and looks up a selected mainnet pool NFT through Dingo", async () => {
  const search = vi.fn().mockResolvedValue([]);
  const resolve = vi.fn().mockResolvedValue([]);
  const provider = new DingoSundaeQueryProvider({
    queryClient: { searchUtxosByAsset: search }, resolveUnspentOutputs: resolve,
  } as unknown as DingoProvider);
  const protocol = await provider.getProtocolParamsWithScripts(EContractVersion.V3);
  expect(protocol.references[0].txIn.hash).toBe("f5f1bdfad3eb4d67d2fc36f36f47fc2938cf6f001689184ab320735a28642cf2");
  await expect(provider.findPoolDataByIdent({ ident: POOL_PRESETS[0].ident })).rejects.toThrow("not found");
  expect(Core.toHex(search.mock.calls[0][0])).toBe("e0302560ced2fdcbfcb2602697df970cd0d6a38f94b32703f51c312b");
  expect(Core.toHex(search.mock.calls[0][1])).toBe("000de140bdf5e1ccc9aea3c8d587cc6b6fb74ea531538e96ab8cb7d56238698e");
});

it("queries the mainnet V4 payment credential through Dingo", async () => {
  mocks.search.mockResolvedValue({ items: [], nextToken: "" });
  await expect(discoverV4Pools()).resolves.toEqual([]);
  expect(Core.toHex(mocks.search.mock.calls[0][0].predicate.match.utxoPattern.value.address.paymentPart)).toBe("21c9b7b965646069f9becebf8b4c3cedaf84c19b109eaa5980a14a26");
});

function rpcPool(address?: Core.Address, index = poolFixture.index) {
  const original = Core.TransactionOutput.fromCbor(Core.HexBlob(poolFixture.cbor));
  const output = address ? new Core.TransactionOutput(address, Core.Value.fromCbor(original.amount().toCbor())) : original;
  if (address) output.setDatum(Core.Datum.fromCbor(original.datum()!.toCbor()));
  return { txoRef: { hash: Core.fromHex(poolFixture.hash), index }, nativeBytes: Core.fromHex(output.toCbor()) };
}
const poolHash = "21c9b7b965646069f9becebf8b4c3cedaf84c19b109eaa5980a14a26";
it.each([
  { label: "mainnet script staking address", network: 1, hash: poolHash, key: false, pointer: false, accepted: 1 },
  { label: "testnet script staking address", network: 0, hash: poolHash, key: false, pointer: false, accepted: 0 },
  { label: "another script", network: 1, hash: "11".repeat(28), key: false, pointer: false, accepted: 0 },
  { label: "key hash with matching bytes", network: 1, hash: poolHash, key: true, pointer: false, accepted: 0 },
  { label: "script pointer address", network: 1, hash: poolHash, key: false, pointer: true, accepted: 1 },
])("authenticates the pool NFT and $label", async ({ network, hash, key, pointer, accepted }) => {
  const address = pointer ? Core.Address.fromBytes(Core.HexBlob("51" + hash + "000000"))
    : Core.Cardano.BaseAddress.fromCredentials(network,
      { type: key ? Core.CredentialType.KeyHash : Core.CredentialType.ScriptHash, hash: Core.Hash28ByteBase16(hash) },
      { type: Core.CredentialType.KeyHash, hash: Core.Hash28ByteBase16("22".repeat(28)) },
    ).toAddress();
  mocks.search.mockResolvedValue({ items: [rpcPool(address)], nextToken: "" });
  const pools = await discoverV4Pools();
  expect(pools).toHaveLength(accepted);
  if (accepted) expect(pools[0].ident).toBe("9f91de10b16697c05362266204fc744e7771e8c1a5124e2e273c4e30");
});
it("keeps a valid pool when the index also returns an unrelated key credential", async () => {
  const keyAddress = Core.addressFromCredential(1, Core.Credential.fromCore({
    type: Core.CredentialType.KeyHash, hash: Core.Hash28ByteBase16(poolHash),
  }));
  mocks.search.mockResolvedValue({ items: [rpcPool(keyAddress, poolFixture.index + 1), rpcPool()], nextToken: "" });
  const pools = await discoverV4Pools();
  expect(pools).toHaveLength(1);
  expect(pools[0].ident).toBe("9f91de10b16697c05362266204fc744e7771e8c1a5124e2e273c4e30");
});
