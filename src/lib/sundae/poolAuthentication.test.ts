// @vitest-environment node
import { beforeAll, expect, it } from "vitest";
import { Core } from "@blaze-cardano/sdk";
import { DingoSundaeQueryProvider } from "./dingoQueryProvider";
import type { DingoProvider } from "../dingo/utxorpc/provider";
import fixture from "./mainnet-v3-pool.fixture.json";
import { vi } from "vitest";
vi.mock("../dingo/config", () => ({
  DINGO_NETWORK: { id: "mainnet", label: "Mainnet" },
  DINGO_CONFIG: {},
}));
beforeAll(() => Core.initCrypto());
const ident = "bdf5e1ccc9aea3c8d587cc6b6fb74ea531538e96ab8cb7d56238698e";
function provider(output: Core.TransactionOutput) {
  return new DingoSundaeQueryProvider({
    queryClient: {
      searchUtxosByAsset: async () => [
        { txoRef: { hash: Core.fromHex(fixture.hash), index: fixture.index } },
      ],
    },
    resolveUnspentOutputs: async () => [
      new Core.TransactionUnspentOutput(
        new Core.TransactionInput(
          Core.TransactionId(fixture.hash),
          BigInt(fixture.index),
        ),
        output,
      ),
    ],
  } as unknown as DingoProvider);
}
it("reads the authenticated mainnet V3 pool NFT and datum captured through Dingo", async () => {
  const pool = await provider(
    Core.TransactionOutput.fromCbor(Core.HexBlob(fixture.cbor)),
  ).findPoolDataByIdent({ ident });
  expect(pool.ident).toBe(ident);
  expect(pool.assetA.assetId).toBe("ada.lovelace");
  expect(pool.assetB.assetId).toBe(
    "1f3aec8bfe7ea4fe14c5f121e2a92e301afe414147860d557cac7e34.5553444378",
  );
  expect(pool.liquidity.lpTotal).toBeGreaterThan(0n);
});
it.each(["network", "key", "script", "nft"])(
  "rejects a pool with a foreign %s",
  async (kind) => {
    const original = Core.TransactionOutput.fromCbor(
      Core.HexBlob(fixture.cbor),
    );
    const hash =
      kind === "script"
        ? "11".repeat(28)
        : original.address().getProps().paymentPart!.hash;
    const address = Core.addressFromCredential(
      kind === "network" ? 0 : 1,
      Core.Credential.fromCore({
        type:
          kind === "key"
            ? Core.CredentialType.KeyHash
            : Core.CredentialType.ScriptHash,
        hash: Core.Hash28ByteBase16(hash),
      }),
    );
    const value = Core.Value.fromCbor(original.amount().toCbor());
    if (kind === "nft") {
      const assets = value.multiasset()!;
      assets.set(
        Core.AssetId(
          "e0302560ced2fdcbfcb2602697df970cd0d6a38f94b32703f51c312b000de140" +
            ident,
        ),
        2n,
      );
      value.setMultiasset(assets);
    }
    const output = new Core.TransactionOutput(address, value);
    output.setDatum(Core.Datum.fromCbor(original.datum()!.toCbor()));
    await expect(
      provider(output).findPoolDataByIdent({ ident }),
    ).rejects.toThrow("Not an authenticated SundaeSwap V3 pool output.");
  },
);
