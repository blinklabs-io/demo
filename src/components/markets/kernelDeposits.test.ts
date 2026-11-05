// @vitest-environment node
import { Core, calculateMinAda } from "@blaze-cardano/sdk";
import { beforeAll, expect, it } from "vitest";
import {
  ADA,
  pd,
  createKernelPlan,
  type KernelCreation,
} from "../../lib/kernel/actions";
import { KERNEL_LANES } from "../../lib/kernel/protocol";
import { kernelRecord } from "../../lib/kernel/markets";
import { kernelLifecyclePlan } from "../../lib/kernel/lifecycle";
import { kernelMinimumDeposits } from "./kernelDeposits";
const stake = "11".repeat(28),
  native = { policyId: "33".repeat(28), name: "01" };
beforeAll(() => Core.initCrypto());
function record(action: KernelCreation, index = 0) {
  const address = Core.addressFromCredential(
    0,
    Core.Credential.fromCore({
      type: Core.CredentialType.KeyHash,
      hash: Core.Hash28ByteBase16(stake),
    }),
  );
  const plan = createKernelPlan(action, address, stake),
    output = new Core.TransactionOutput(plan.address, plan.value);
  output.setDatum(Core.Datum.newInlineData(plan.datum));
  return kernelRecord(
    plan.lane,
    new Core.TransactionUnspentOutput(
      new Core.TransactionInput(
        Core.TransactionId("44".repeat(32)),
        BigInt(index),
      ),
      output,
    ),
  );
}
function option(premium: typeof ADA) {
  return record({
    kind: "option-proposal",
    offer: ADA,
    offerQuantity: 10000000n,
    ask: native,
    premium,
    premiumQuantity: 5000000n,
    strike: { numerator: 1n, denominator: 1000000n },
    expiresAt: 1900000000000,
    deposit: 5000000n,
  });
}
it("adds no extra ADA to an already adequate ADA premium or existing contract deposit", () => {
  const position = option(ADA),
    result = kernelMinimumDeposits(
      {
        kind: "option-purchase",
        record: position,
        termsIndex: 0,
        paymentDeposit: 0n,
        contractTopUp: 0n,
      },
      4310,
      undefined,
      1800000000000,
    );
  expect(result.action).toMatchObject({
    paymentDeposit: 0n,
    contractTopUp: 0n,
  });
  expect(result.outputs[0].coin).toBe(5000000n);
  expect(result.outputs.every((output) => output.extra === 0n)).toBe(true);
});
it("funds only the native premium payment minimum without copying it into the continuing contract", () => {
  const position = option(native),
    result = kernelMinimumDeposits(
      {
        kind: "option-purchase",
        record: position,
        termsIndex: 0,
        paymentDeposit: 0n,
        contractTopUp: 0n,
      },
      4310,
      undefined,
      1800000000000,
    );
  expect(result.action).toMatchObject({ contractTopUp: 0n });
  expect(result.outputs[0].extra).toBeGreaterThan(0n);
  expect(result.outputs[0].coin).toBeLessThan(5000000n);
  expect(result.outputs[1].extra).toBe(0n);
  const plan = kernelLifecyclePlan(result.action, undefined, 1800000000000);
  for (const output of plan.outputs)
    expect(output.amount().coin()).toBeGreaterThanOrEqual(
      calculateMinAda(output, 4310),
    );
});
it("computes collateral and lender output minima independently while previewing without a wallet", () => {
  const ask = record({
    kind: "loan-ask",
    principal: 10000000n,
    termDays: 30,
    collateral: native,
    deposit: 5000000n,
  });
  const offer = record(
    {
      kind: "loan-offer",
      borrowerStakeHash: stake,
      principal: 10000000n,
      termDays: 30,
      interest: { numerator: 1n, denominator: 10n },
      collateral: native,
      collateralRatio: { numerator: 1n, denominator: 1000000n },
      claimDays: 7,
      deposit: 5000000n,
    },
    1,
  );
  const result = kernelMinimumDeposits(
    { kind: "loan-accept", ask, offer, collateralDeposit: 0n, lenderTopUp: 0n },
    4310,
    undefined,
    1800000000000,
  );
  expect(result.action.kind).toBe("loan-accept");
  if (result.action.kind !== "loan-accept") throw new Error("Wrong action");
  expect(result.action.collateralDeposit).toBeGreaterThan(0n);
  expect(result.action.lenderTopUp).toBe(0n);
  const plan = kernelLifecyclePlan(result.action, stake, 1800000000000);
  for (const output of plan.outputs)
    expect(output.amount().coin()).toBeGreaterThanOrEqual(
      calculateMinAda(output, 4310),
    );
  const active = kernelRecord(
    "loan-active",
    new Core.TransactionUnspentOutput(
      new Core.TransactionInput(Core.TransactionId("66".repeat(32)), 0n),
      plan.outputs[0],
    ),
  );
  const repayment = kernelMinimumDeposits(
    { kind: "loan-repay", record: active, paymentDeposit: 0n },
    4310,
    undefined,
    1800000001000,
  );
  expect(repayment.action).toMatchObject({ paymentDeposit: 0n });
  expect(repayment.outputs[0].coin).toBe(11000000n);
});
it("rejects missing output-size parameters instead of using a fixed reserve", () => {
  expect(() =>
    kernelMinimumDeposits(
      {
        kind: "option-purchase",
        record: option(ADA),
        termsIndex: 0,
        paymentDeposit: 0n,
        contractTopUp: 0n,
      },
      0,
      undefined,
      1800000000000,
    ),
  ).toThrow("parameters");
});

it("keeps ADA collateral at exactly the required minimum floor, not minimum plus collateral", () => {
  const convert = (source: ReturnType<typeof record>) => {
    const output = Core.TransactionOutput.fromCbor(
        source.utxo.output().toCbor(),
      ),
      con = output.datum()!.asInlineData()!.asConstrPlutusData()!,
      list = con.getData(),
      f = Array.from({ length: list.getLength() }, (_, i) => list.get(i)),
      isAsk = source.kind === "AskDatum";
    const oldBeacon = String(Core.sha2_256(Core.HexBlob("4173736574"))),
      newBeacon = String(
        Core.sha2_256(
          Core.HexBlob("4173736574" + native.policyId + native.name),
        ),
      );
    f[isAsk ? 3 : 4] = pd.list([
      pd.bytes(native.policyId),
      pd.bytes(native.name),
    ]);
    f[isAsk ? 4 : 5] = pd.bytes(newBeacon);
    f[isAsk ? 7 : 13] = isAsk
      ? pd.map([[pd.bytes(""), pd.bytes("")]])
      : pd.map([
          [
            pd.list([pd.bytes(""), pd.bytes("")]),
            pd.list([pd.int(10000n), pd.int(1n)]),
          ],
        ]);
    const assets = new Map(output.amount().multiasset());
    const policy = KERNEL_LANES["loan-negotiation"].beaconPolicy;
    assets.delete(Core.AssetId(policy + oldBeacon));
    assets.set(Core.AssetId(policy + newBeacon), 1n);
    assets.delete(Core.AssetId(native.policyId + native.name));
    if (!isAsk) assets.set(Core.AssetId(native.policyId + native.name), 100n);
    const converted = new Core.TransactionOutput(
      output.address(),
      new Core.Value(5000000n, assets),
    );
    converted.setDatum(
      Core.Datum.newInlineData(pd.con(Number(con.getAlternative()), f)),
    );
    return kernelRecord(
      "loan-negotiation",
      new Core.TransactionUnspentOutput(source.utxo.input(), converted),
    );
  };
  const ask = convert(
    record({
      kind: "loan-ask",
      principal: 100n,
      termDays: 30,
      collateral: native,
      deposit: 5000000n,
    }),
  );
  const offer = convert(
    record(
      {
        kind: "loan-offer",
        borrowerStakeHash: stake,
        principal: 100n,
        termDays: 30,
        interest: { numerator: 1n, denominator: 10n },
        collateral: native,
        collateralRatio: { numerator: 10000n, denominator: 1n },
        claimDays: 7,
        deposit: 5000000n,
      },
      1,
    ),
  );
  const result = kernelMinimumDeposits(
    { kind: "loan-accept", ask, offer, collateralDeposit: 0n, lenderTopUp: 0n },
    4310,
    undefined,
    1800000000000,
  );
  const plan = kernelLifecyclePlan(result.action, stake, 1800000000000),
    output = plan.outputs[0];
  expect(output.amount().coin()).toBe(calculateMinAda(output, 4310));
  expect(result.outputs[0].extra).toBe(output.amount().coin() - 1000000n);
});
it("rejects a pinned lender deposit below minimum instead of adding an invalid top-up", () => {
  const ask = record({
    kind: "loan-ask",
    principal: 10000000n,
    termDays: 30,
    collateral: native,
    deposit: 5000000n,
  });
  const offer = record(
    {
      kind: "loan-offer",
      borrowerStakeHash: stake,
      principal: 10000000n,
      termDays: 30,
      interest: { numerator: 1n, denominator: 10n },
      collateral: native,
      collateralRatio: { numerator: 1n, denominator: 1000000n },
      claimDays: 7,
      deposit: 5000000n,
    },
    1,
  );
  expect(() =>
    kernelMinimumDeposits(
      {
        kind: "loan-accept",
        ask,
        offer,
        collateralDeposit: 0n,
        lenderTopUp: 0n,
      },
      100000,
      undefined,
      1800000000000,
    ),
  ).toThrow("pinned lender deposit");
});
