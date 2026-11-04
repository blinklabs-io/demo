// @vitest-environment node
import { afterEach, beforeAll, expect, it, vi } from "vitest";
import { Core } from "@blaze-cardano/sdk";
import {
  ADA_METADATA,
  EContractVersion,
  TxBuilderV3,
  type IPoolData,
} from "@sundaeswap/core";
import { buildSwapOrder, type BuildSwapArgs } from "./swap";

beforeAll(async () => {
  await Core.initCrypto();
});
afterEach(() => {
  vi.restoreAllMocks();
});
function fixture() {
  const address = Core.addressFromCredential(
    0,
    Core.Credential.fromCore({
      type: Core.CredentialType.KeyHash,
      hash: Core.Hash28ByteBase16("11".repeat(28)),
    }),
  );
  const tx = new Core.Transaction(
    new Core.TransactionBody(
      Core.CborSet.fromCore([], Core.TransactionInput.fromCore),
      [new Core.TransactionOutput(address, new Core.Value(5000000n))],
      170000n,
    ),
    new Core.TransactionWitnessSet(),
  );
  let active = true,
    network = 0;
  const sign = vi.fn(async () => ({ cbor: tx.toCbor() }));
  const post = vi.fn(async () => tx.getId());
  const build = vi.fn(async () => ({ cbor: tx.toCbor(), builtTx: tx, sign }));
  vi.spyOn(TxBuilderV3.prototype, "swap").mockResolvedValue({
    build,
    fees: { deposit: { amount: 2000000n }, scooperFee: { amount: 1000000n } },
  } as unknown as Awaited<ReturnType<TxBuilderV3["swap"]>>);
  const pool: IPoolData = {
    ident: "11".repeat(28),
    currentFee: 0.003,
    assetA: ADA_METADATA,
    assetB: { assetId: "22".repeat(28) + ".544f4b454e", decimals: 0 },
    assetLP: { assetId: "33".repeat(28) + ".4c50" },
    liquidity: { aReserve: 1000000000n, bReserve: 1000000n, lpTotal: 1n },
    version: EContractVersion.V3,
  };
  const args = {
    blaze: {
      wallet: {
        getNetworkId: async () => network,
        getChangeAddress: async () => address,
      },
      provider: {
        networkName: "cardano-preview",
        postTransactionToChain: post,
      },
    },
    queryProvider: {},
    pool,
    amount: "5",
    direction: "adaToToken",
    slippagePercent: "1",
    assertConnection: () => {
      if (!active) throw new Error("Session changed");
    },
  } as unknown as BuildSwapArgs;
  return {
    args,
    build,
    sign,
    post,
    tx,
    disconnect: () => {
      active = false;
    },
    mainnet: () => {
      network = 1;
    },
  };
}
it("builds unsigned V3 orders separately from wallet signing and submission", async () => {
  const f = fixture();
  const draft = await buildSwapOrder(f.args);
  expect(f.sign).not.toHaveBeenCalled();
  expect(f.post).not.toHaveBeenCalled();
  await draft.signAndSubmit();
  expect(f.sign).toHaveBeenCalledTimes(1);
  expect(f.post).toHaveBeenCalledTimes(1);
});
it("rejects a V3 build whose originating session left during SDK completion", async () => {
  const f = fixture();
  f.build.mockImplementation(async () => {
    f.disconnect();
    return { cbor: f.tx.toCbor(), builtTx: f.tx, sign: f.sign };
  });
  await expect(buildSwapOrder(f.args)).rejects.toThrow("Session changed");
  expect(f.sign).not.toHaveBeenCalled();
  expect(f.post).not.toHaveBeenCalled();
});
it("does not sign a reviewed V3 order after disconnect", async () => {
  const f = fixture();
  const draft = await buildSwapOrder(f.args);
  f.disconnect();
  await expect(draft.signAndSubmit()).rejects.toThrow("Session changed");
  expect(f.sign).not.toHaveBeenCalled();
  expect(f.post).not.toHaveBeenCalled();
});
it("does not submit V3 when wallet changes network while approval is pending", async () => {
  const f = fixture();
  const draft = await buildSwapOrder(f.args);
  f.sign.mockImplementation(async () => {
    f.mainnet();
    return { cbor: f.tx.toCbor() };
  });
  await expect(draft.signAndSubmit()).rejects.toThrow("testnet");
  expect(f.sign).toHaveBeenCalledTimes(1);
  expect(f.post).not.toHaveBeenCalled();
});

it("shows the wallet's CIP-30 rejection message instead of an empty error", async () => {
  const f = fixture();
  const draft = await buildSwapOrder(f.args);
  f.sign.mockRejectedValue({ code: 2, info: "User declined the signature" });
  await expect(draft.signAndSubmit()).rejects.toThrow(
    "User declined the signature",
  );
  expect(f.post).not.toHaveBeenCalled();
});
