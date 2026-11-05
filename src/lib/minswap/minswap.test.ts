// @vitest-environment node
import { Core } from "@blaze-cardano/sdk";
import { describe, expect, it } from "vitest";
import { authenticatePool, decodePoolDatum, type PoolDatum } from "./data";
import { poolFixtures } from "./fixtures";
import { MAX_LIQUIDITY, PREPROD_MINSWAP_V2 } from "./constants";
import { quoteDeposit, quoteSwap, quoteWithdraw } from "./quotes";
import {
  decodeOrder,
  orderAddress,
  orderDatum,
  type MinswapAction,
} from "./orders";
const example: PoolDatum = {
  assetA: "lovelace",
  assetB: "11".repeat(28),
  reserveA: 1000000n,
  reserveB: 2000000n,
  totalLiquidity: 10000n,
  feeA: 30n,
  feeB: 50n,
  dynamicFee: false,
};
describe("canonical Minswap V2 Preprod pools", () => {
  it.each(poolFixtures)(
    "authenticates real pool $tx_hash and derives its recorded LP token",
    (row) => {
      const pool = authenticatePool(row);
      expect(
        row.amount.find((amount) => amount.unit === pool.lpAsset)?.quantity,
      ).toBe(String(MAX_LIQUIDITY - pool.totalLiquidity + 10n));
      expect(pool.reserveA).toBeGreaterThan(0n);
      expect(pool.reserveB).toBeGreaterThan(0n);
    },
  );
  it("does not include the fixed ADA buffer in tradable reserves", () => {
    const pool = authenticatePool(poolFixtures[1]);
    expect(pool.assetA).toBe("lovelace");
    expect(pool.reserveA).toBe(
      BigInt(poolFixtures[1].amount[0].quantity) - 4500000n,
    );
  });
  it("rejects counterfeit authentication tokens and underbacked pool data", () => {
    expect(() =>
      authenticatePool({
        ...poolFixtures[0],
        amount: poolFixtures[0].amount.filter(
          (a) => a.unit !== PREPROD_MINSWAP_V2.poolAuthenAsset,
        ),
      }),
    ).toThrow("authentication token");
    const row = structuredClone(poolFixtures[1]);
    row.amount[0].quantity = "4500000";
    expect(() => authenticatePool(row)).toThrow("does not back");
  });
  it("rejects a payment address outside the canonical pool script", () => {
    expect(() =>
      authenticatePool({
        ...poolFixtures[0],
        address: PREPROD_MINSWAP_V2.orderEnterpriseAddress,
      }),
    ).toThrow("Unrecognized Minswap");
  });
});
describe("integer pool quotes", () => {
  it("uses directional fees and floors minimum received", () => {
    expect(quoteSwap(example, "a-to-b", 10000n)).toMatchObject({
      expected: 19743n,
      minimum: 19644n,
    });
    expect(quoteSwap(example, "b-to-a", 10000n)).toMatchObject({
      expected: 4950n,
      minimum: 4925n,
    });
  });
  it("quotes proportional and one-sided liquidity deposits", () => {
    expect(quoteDeposit(example, 10000n, 20000n)).toEqual({
      expected: 100n,
      minimum: 99n,
      imbalanced: false,
    });
    expect(quoteDeposit(example, 10000n, 0n)).toEqual({
      expected: 49n,
      minimum: 48n,
      imbalanced: true,
    });
  });
  it("values LP tokens as a proportion of both datum reserves", () => {
    expect(quoteWithdraw(example, 100n)).toEqual({
      amountA: 10000n,
      amountB: 20000n,
      minimumA: 9950n,
      minimumB: 19900n,
      shareBps: 100,
    });
    expect(() => quoteWithdraw(example, 10001n)).toThrow("exceeds");
    expect(() => quoteSwap(example, "a-to-b", -1n)).toThrow("positive");
    expect(() => quoteDeposit(example, 1n, 1n, 10000)).toThrow("Slippage");
  });
});
describe("canonical asynchronous order datums", () => {
  const sender = Core.Cardano.EnterpriseAddress.fromCredentials(
    Core.NetworkId.Testnet,
    {
      type: Core.CredentialType.KeyHash,
      hash: Core.Hash28ByteBase16("33".repeat(28)),
    },
  ).toAddress();
  const pool = authenticatePool(poolFixtures[1]);
  it.each<MinswapAction>([
    { kind: "swap", direction: "a-to-b", amount: 1000n, slippageBps: 50 },
    { kind: "deposit", amountA: 1000n, amountB: 1000n, slippageBps: 50 },
    { kind: "withdraw", lpAmount: 1000n, slippageBps: 50 },
  ])(
    "encodes $kind with owner cancellation, exact LP target and batcher limit",
    (action) => {
      const cbor = orderDatum(sender, pool.lpAsset, action, {
        minimum: 1n,
        minimumA: 1n,
        minimumB: 1n,
      }).toCbor();
      const decoded = decodeOrder({
        ...poolFixtures[0],
        address: orderAddress(sender).toBech32(),
        inline_datum: cbor,
      });
      expect(decoded.kind).toBe(action.kind);
      expect(decoded.canceller).toBe("33".repeat(28));
      expect(decoded.lpAsset).toBe(pool.lpAsset);
      expect(decoded.maxBatcherFee).toBe(2000000n);
      const fields = Core.PlutusData.fromCbor(cbor)
        .asConstrPlutusData()!
        .getData();
      expect(fields.getLength()).toBe(9);
      expect(fields.get(8).asConstrPlutusData()!.getAlternative()).toBe(1n);
    },
  );
  it("retains sender staking credentials at the order address", () => {
    const base = Core.Cardano.BaseAddress.fromCredentials(
      Core.NetworkId.Testnet,
      sender.getProps().paymentPart!,
      {
        type: Core.CredentialType.KeyHash,
        hash: Core.Hash28ByteBase16("44".repeat(28)),
      },
    ).toAddress();
    expect(orderAddress(base).getProps().delegationPart).toEqual(
      base.getProps().delegationPart,
    );
    expect(orderAddress(base).getProps().paymentPart?.hash).toBe(
      PREPROD_MINSWAP_V2.orderScriptHash,
    );
  });
  it("rejects a datum with the wrong pool constructor", () => {
    expect(() => decodePoolDatum("d87a80")).toThrow(
      "Unsupported Minswap datum",
    );
  });
});
