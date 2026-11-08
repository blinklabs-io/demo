// @vitest-environment node
import { beforeAll, expect, it, vi } from "vitest";
import { Core } from "@blaze-cardano/sdk";
import { EContractVersion } from "@sundaeswap/core";
import { DingoSundaeQueryProvider } from "./dingoQueryProvider";
import { discoverV4Pools } from "./v4";
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

it.each([
  [1, "21c9b7b965646069f9becebf8b4c3cedaf84c19b109eaa5980a14a26", true],
  [0, "21c9b7b965646069f9becebf8b4c3cedaf84c19b109eaa5980a14a26", false],
  [1, "11".repeat(28), false],
] as const)("authenticates a staking pool address on network %s with credential %s", async (network, hash, valid) => {
  const address = Core.Cardano.BaseAddress.fromCredentials(network,
    Core.Credential.fromCore({ type: Core.CredentialType.ScriptHash, hash: Core.Hash28ByteBase16(hash) }).toCore(),
    Core.Credential.fromCore({ type: Core.CredentialType.KeyHash, hash: Core.Hash28ByteBase16("22".repeat(28)) }).toCore(),
  ).toAddress();
  const output = new Core.TransactionOutput(address, new Core.Value(2000000n));
  mocks.search.mockResolvedValue({ items: [{ txoRef: { hash: Core.fromHex("33".repeat(32)), index: 0 }, nativeBytes: Core.fromHex(output.toCbor()) }], nextToken: "" });
  if (valid) await expect(discoverV4Pools()).resolves.toEqual([]);
  else await expect(discoverV4Pools()).rejects.toThrow("another address");
});
