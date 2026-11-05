// @vitest-environment node
import { SPOT_UTXO_CBOR } from "./fixtures";
import { kernelLifecyclePlan, loanCollateralChoices } from "./lifecycle";
import { Core } from "@blaze-cardano/sdk";
import { beforeAll, expect, it } from "vitest";
import { ADA, pd, createKernelPlan, type KernelCreation } from "./actions";
import { decodeKernelDatum } from "./datum";
import { kernelRecord } from "./markets";
import { quoteKernelSwap } from "./swap";
import { canCloseKernelRecord, closeKernelPlan } from "./close";
import { KERNEL_LANES, KERNEL_OBSERVERS } from "./protocol";
beforeAll(() => Core.initCrypto());
const stake = "11".repeat(28),
  other = "22".repeat(28);
const native = { policyId: "33".repeat(28), name: "01" };
const payment = Core.addressFromCredential(
  0,
  Core.Credential.fromCore({
    type: Core.CredentialType.KeyHash,
    hash: Core.Hash28ByteBase16(stake),
  }),
);
const common = { deposit: 5000000n };
const actions: KernelCreation[] = [
  {
    kind: "loan-ask",
    principal: 10000000n,
    termDays: 30,
    collateral: native,
    ...common,
  },
  {
    kind: "loan-offer",
    borrowerStakeHash: other,
    principal: 10000000n,
    termDays: 30,
    interest: { numerator: 1n, denominator: 10n },
    collateral: native,
    collateralRatio: { numerator: 1n, denominator: 1000000n },
    claimDays: 7,
    ...common,
  },
  {
    kind: "option-proposal",
    offer: ADA,
    offerQuantity: 10000000n,
    ask: native,
    premium: ADA,
    premiumQuantity: 1000000n,
    strike: { numerator: 1n, denominator: 1000000n },
    expiresAt: 1900000000000,
    ...common,
  },
  { kind: "spot-sale", nft: native, price: 10000000n, ...common },
  {
    kind: "limit-order",
    offer: native,
    offerQuantity: 100n,
    ask: ADA,
    price: { numerator: 3n, denominator: 2n },
    ...common,
  },
];
function record(action: KernelCreation) {
  const plan = createKernelPlan(action, payment, stake);
  const output = new Core.TransactionOutput(plan.address, plan.value);
  output.setDatum(Core.Datum.newInlineData(plan.datum));
  return kernelRecord(
    plan.lane,
    new Core.TransactionUnspentOutput(
      new Core.TransactionInput(
        Core.TransactionId("44".repeat(32)),
        BigInt(
          {
            "loan-ask": 0,
            "loan-offer": 1,
            "option-proposal": 3,
            "spot-sale": 4,
            "limit-order": 2,
          }[action.kind],
        ),
      ),
      output,
    ),
  );
}
it.each(actions)(
  "encodes canonical on-chain schema and refundable owner position: $kind",
  (action) => {
    const plan = createKernelPlan(action, payment, stake),
      decoded = decodeKernelDatum(
        KERNEL_LANES[plan.lane].family,
        plan.datum.toCbor(),
      );
    expect(decoded.kind).toBe(
      {
        "loan-ask": "AskDatum",
        "loan-offer": "OfferDatum",
        "option-proposal": "ProposalDatum",
        "spot-sale": "SpotDatum",
        "limit-order": "SwapDatum",
      }[action.kind],
    );
    const position = record(action);
    expect(canCloseKernelRecord(position, stake)).toBe(true);
    expect(canCloseKernelRecord(position, other)).toBe(false);
    const closing = closeKernelPlan(position, stake);
    expect([...closing.mint].sort()).toEqual(
      [...plan.mint].map(([name, quantity]) => [name, -quantity]).sort(),
    );
    expect(() => closeKernelPlan(position, other)).toThrow(/does not own/);
  },
);
it("prices a direct swap with ceiling rounding and preserves exact continuing beacons/previous input", () => {
  const position = record(actions[4]);
  const quote = quoteKernelSwap(position, 3n);
  expect(quote.paid).toBe(5n);
  expect(
    quote.value.multiasset()?.get(Core.AssetId(native.policyId + native.name)),
  ).toBe(97n);
  expect(quote.value.coin()).toBe(5000005n);
  for (const [unit, quantity] of position.utxo.output().amount().multiasset()!)
    if (unit.startsWith(KERNEL_LANES["one-way"].beaconPolicy))
      expect(quote.value.multiasset()?.get(unit)).toBe(quantity);
  const decoded = decodeKernelDatum("one-way", quote.datum.toCbor());
  expect(decoded.fields.prev_input).toMatchObject({
    kind: "Some",
    fields: {
      "0": {
        kind: "OutputReference",
        fields: {
          output_index: 2n,
          transaction_id: { fields: { hash: "44".repeat(32) } },
        },
      },
    },
  });
  expect(() => quoteKernelSwap(position, 101n)).toThrow(/exceeds/);
});
it("rejects malformed nested price/schema rather than treating unknown data as an order", () => {
  expect(() => decodeKernelDatum("one-way", "d87980")).toThrow(/field count/);
  const position = record(actions[4]);
  expect(() => decodeKernelDatum("one-way", position.datumCbor + "00")).toThrow(
    /Trailing/,
  );
  expect(() =>
    createKernelPlan(
      {
        ...actions[4],
        price: { numerator: 1n, denominator: 0n },
      } as KernelCreation,
      payment,
      stake,
    ),
  ).toThrow(/positive/);
});
it("decodes a real spot price map and creates the exact seller payment plus observer", () => {
  const record = kernelRecord(
    "aftermarket",
    Core.TransactionUnspentOutput.fromCbor(Core.HexBlob(SPOT_UTXO_CBOR)),
  );
  expect(record.kind).toBe("SpotDatum");
  expect(Array.isArray(record.fields.sale_price)).toBe(true);
  const plan = kernelLifecyclePlan(
    { kind: "spot-purchase", record, paymentDeposit: 0n },
    undefined,
    1700000000000,
  );
  expect(plan.inputs[0].redeemer.asConstrPlutusData()?.getAlternative()).toBe(
    2n,
  );
  expect(plan.observer?.hash).toBe(
    "3e5528d9a7610aa5459a7deed9d3c1c2ee8b0310fae6642df4c37213",
  );
  expect(plan.outputs[0].amount().coin()).toBe(15000000n);
  expect([...plan.mints[0].assets.values()]).toEqual([-1n, -1n]);
});
it("preserves principal and exact stake identity when activating an offer, then repays the ceiling balance", () => {
  const ask = record(actions[0]);
  const offerAction = {
    ...actions[1],
    borrowerStakeHash: stake,
  } as KernelCreation;
  const offer = record(offerAction);
  const accepted = kernelLifecyclePlan(
    {
      kind: "loan-accept",
      ask,
      offer,
      collateralDeposit: 5000000n,
      lenderTopUp: 0n,
    },
    stake,
    1700000000000,
  );
  const active = kernelRecord(
    "loan-active",
    new Core.TransactionUnspentOutput(
      new Core.TransactionInput(Core.TransactionId("77".repeat(32)), 0n),
      accepted.outputs[0],
    ),
  );
  expect(active.fields.loan_outstanding).toEqual([11000000n, 1n]);
  expect(active.fields.loan_principal).toBe(10000000n);
  const repay = kernelLifecyclePlan(
    { kind: "loan-repay", record: active, paymentDeposit: 0n },
    stake,
    1700001000000,
  );
  expect(repay.outputs[0].amount().coin()).toBe(11000000n);
  expect(repay.mints[0].redeemer.asConstrPlutusData()?.getAlternative()).toBe(
    3n,
  );
  expect(repay.observer?.redeemer.asConstrPlutusData()?.getAlternative()).toBe(
    0n,
  );
  expect(() =>
    kernelLifecyclePlan(
      { kind: "loan-repay", record: active, paymentDeposit: 0n },
      other,
      1700001000000,
    ),
  ).toThrow(/borrower/);
});
it("mints a buyer's options key separately and burns both keys on exact-ceiling exercise", () => {
  const proposal = record(actions[2]);
  const purchase = kernelLifecyclePlan(
    {
      kind: "option-purchase",
      record: proposal,
      termsIndex: 0,
      paymentDeposit: 0n,
      contractTopUp: 0n,
    },
    undefined,
    1700000000000,
  );
  const active = kernelRecord(
    "option-active",
    new Core.TransactionUnspentOutput(
      new Core.TransactionInput(Core.TransactionId("88".repeat(32)), 1n),
      purchase.outputs[1],
    ),
  );
  const id = String(active.fields.contract_id);
  expect(purchase.mints[1].assets.get(Core.AssetName(id))).toBe(2n);
  const exercise = kernelLifecyclePlan(
    { kind: "option-exercise", record: active, paymentDeposit: 0n },
    undefined,
    1700000000000,
  );
  expect(exercise.mints[0].assets.get(Core.AssetName(id))).toBe(-2n);
  expect(
    exercise.outputs[0]
      .amount()
      .multiasset()
      ?.get(Core.AssetId(native.policyId + native.name)),
  ).toBe(10n);
});
function activeLoan() {
  const ask = record(actions[0]),
    offer = record({
      ...actions[1],
      borrowerStakeHash: stake,
    } as KernelCreation);
  const plan = kernelLifecyclePlan(
    {
      kind: "loan-accept",
      ask,
      offer,
      collateralDeposit: 5000000n,
      lenderTopUp: 0n,
    },
    stake,
    1700000000000,
  );
  return kernelRecord(
    "loan-active",
    new Core.TransactionUnspentOutput(
      new Core.TransactionInput(Core.TransactionId("77".repeat(32)), 0n),
      plan.outputs[0],
    ),
  );
}
function changedLoan(
  record: ReturnType<typeof activeLoan>,
  change: (fields: Core.PlutusData[]) => void,
) {
  const original = Core.PlutusData.fromCbor(Core.HexBlob(record.datumCbor))
    .asConstrPlutusData()!
    .getData();
  const values = Array.from({ length: original.getLength() }, (_, i) =>
    original.get(i),
  );
  change(values);
  const output = new Core.TransactionOutput(
    record.utxo.output().address(),
    Core.Value.fromCbor(record.utxo.output().amount().toCbor()),
  );
  output.setDatum(Core.Datum.newInlineData(pd.con(2, values)));
  return kernelRecord(
    "loan-active",
    new Core.TransactionUnspentOutput(record.utxo.input(), output),
  );
}
it("applies only elapsed periods, penalties before compounding, and canonical fraction reduction", () => {
  const active = changedLoan(activeLoan(), (fields) => {
    fields[9] = pd.con(0, [pd.int(86400000n)]);
    fields[13] = pd.con(1);
    fields[14] = pd.int(1000000n);
    fields[15] = pd.con(1, [pd.int(1000000n)]);
  });
  const plan = kernelLifecyclePlan(
    { kind: "loan-accrue", record: active, times: 2, depositTopUp: 0n },
    stake,
    1700172800000,
  );
  const decoded = decodeKernelDatum(
    "loans",
    plan.outputs[0].datum()!.asInlineData()!.toCbor(),
  );
  expect(decoded.fields.loan_outstanding).toEqual([15620000n, 1n]);
  expect(decoded.fields.last_epoch_boundary).toBe(1700172800000n);
  expect(plan.requiredKey).toBe(stake);
  expect(() =>
    kernelLifecyclePlan(
      { kind: "loan-accrue", record: active, times: 1, depositTopUp: 0n },
      undefined,
      1700172800000,
    ),
  ).toThrow(/borrower/);
  expect(plan.observer?.hash).toBe(KERNEL_OBSERVERS.loanInterest.hash);
  expect(() =>
    kernelLifecyclePlan(
      { kind: "loan-accrue", record: active, times: 3, depositTopUp: 0n },
      stake,
      1700172800000,
    ),
  ).toThrow(/elapsed/);
});
it("does not require pointless rollover for noncompounding loans without penalties", () => {
  const active = changedLoan(activeLoan(), (fields) => {
    fields[9] = pd.con(0, [pd.int(86400000n)]);
  });
  const plan = kernelLifecyclePlan(
    { kind: "loan-repay", record: active, paymentDeposit: 0n },
    stake,
    1700172800000,
  );
  expect(plan.expiration).toBe(1702592000000);
});
it("burns only position beacons, preserving unrelated assets under the same policy", () => {
  const active = activeLoan(),
    output = Core.TransactionOutput.fromCbor(active.utxo.output().toCbor());
  const assets = new Map(output.amount().multiasset());
  const extra = Core.AssetId(
    KERNEL_LANES["loan-active"].beaconPolicy + "deadbeef",
  );
  assets.set(extra, 1n);
  const modified = new Core.TransactionOutput(
    output.address(),
    new Core.Value(output.amount().coin(), assets),
  );
  modified.setDatum(output.datum()!);
  const record = kernelRecord(
    "loan-active",
    new Core.TransactionUnspentOutput(active.utxo.input(), modified),
  );
  const plan = kernelLifecyclePlan(
    { kind: "loan-repay", record, paymentDeposit: 0n },
    stake,
    1700001000000,
  );
  expect(plan.mints[0].assets.has(Core.AssetName("deadbeef"))).toBe(false);
});
it("uses the payment burn redeemer rather than an expired collateral claim", () => {
  const active = activeLoan();
  const repayment = kernelLifecyclePlan(
    { kind: "loan-repay", record: active, paymentDeposit: 0n },
    stake,
    1700001000000,
  );
  expect(
    repayment.inputs[0].redeemer.asConstrPlutusData()?.getAlternative(),
  ).toBe(3n);
  expect(
    repayment.mints[0].redeemer.asConstrPlutusData()?.getAlternative(),
  ).toBe(3n);
  expect(repayment.outputs[0].amount().coin()).toBe(11000000n);
});
it("allows only the original writer to reclaim an expired option without burning the buyer's separate key", () => {
  const proposal = record(actions[2]),
    purchase = kernelLifecyclePlan(
      {
        kind: "option-purchase",
        record: proposal,
        termsIndex: 0,
        paymentDeposit: 0n,
        contractTopUp: 0n,
      },
      undefined,
      1700000000000,
    );
  const active = kernelRecord(
    "option-active",
    new Core.TransactionUnspentOutput(
      new Core.TransactionInput(Core.TransactionId("88".repeat(32)), 1n),
      purchase.outputs[1],
    ),
  );
  const reclaim = kernelLifecyclePlan(
    { kind: "option-expired-close", record: active },
    stake,
    1900000001000,
  );
  expect(reclaim.requiredKey).toBe(stake);
  expect(reclaim.outputs).toEqual([]);
  expect(
    reclaim.mints[0].assets.get(
      Core.AssetName(String(active.fields.contract_id)),
    ),
  ).toBe(-1n);
  expect(() =>
    kernelLifecyclePlan(
      { kind: "option-expired-close", record: active },
      other,
      1900000001000,
    ),
  ).toThrow(/writer/);
  expect(() =>
    kernelLifecyclePlan(
      { kind: "option-expired-close", record: active },
      stake,
      1700000000000,
    ),
  ).toThrow(/not expired/);
});
it("adds explicit ADA to an ADA-paying continuation and includes it in the quoted debit", () => {
  const position = record(actions[4]);
  const quote = quoteKernelSwap(position, 3n, 1, 1000000n);
  expect(quote.paid).toBe(1000005n);
  expect(quote.extraAda).toBe(1000000n);
  expect(quote.value.coin() - position.utxo.output().amount().coin()).toBe(
    quote.paid,
  );
  expect(() => quoteKernelSwap(position, 3n, 1, -1n)).toThrow(
    "cannot be negative",
  );
});
it("adds ADA separately from native payment and forbids overstating an ADA receipt", () => {
  const nativeAsk = { policyId: "66".repeat(28), name: "02" };
  const position = record({
    kind: "limit-order",
    offer: native,
    offerQuantity: 100n,
    ask: nativeAsk,
    price: { numerator: 3n, denominator: 2n },
    deposit: 5000000n,
  });
  const quote = quoteKernelSwap(position, 3n, 1, 1000000n);
  expect(quote.paid).toBe(5n);
  expect(
    quote.value
      .multiasset()
      ?.get(Core.AssetId(nativeAsk.policyId + nativeAsk.name)),
  ).toBe(5n);
  expect(quote.value.coin()).toBe(6000000n);
  const receivingAda = record({
    kind: "limit-order",
    offer: ADA,
    offerQuantity: 10000000n,
    ask: native,
    price: { numerator: 1n, denominator: 1000000n },
    deposit: 5000000n,
  });
  expect(() => quoteKernelSwap(receivingAda, 1000000n, 1, 1000000n)).toThrow(
    "Reduce the ADA received",
  );
  expect(quoteKernelSwap(receivingAda, 1000000n).take).toBe(1000000n);
});

function changedPosition(
  position: ReturnType<typeof record>,
  change: (
    fields: Core.PlutusData[],
    assets: Map<Core.AssetId, bigint>,
  ) => void,
  lane = position.lane,
) {
  const original = Core.PlutusData.fromCbor(
    Core.HexBlob(position.datumCbor),
  ).asConstrPlutusData()!;
  const fields = Array.from(
    { length: original.getData().getLength() },
    (_, i) => original.getData().get(i),
  );
  const assets = new Map(position.utxo.output().amount().multiasset());
  change(fields, assets);
  const output = new Core.TransactionOutput(
    Core.addressFromCredentials(
      0,
      Core.Credential.fromCore({
        type: Core.CredentialType.ScriptHash,
        hash: Core.Hash28ByteBase16(KERNEL_LANES[lane].validatorHash),
      }),
      Core.Credential.fromCore({
        type: Core.CredentialType.KeyHash,
        hash: Core.Hash28ByteBase16(stake),
      }),
    ),
    new Core.Value(position.lovelace, assets),
  );
  output.setDatum(
    Core.Datum.newInlineData(pd.con(Number(original.getAlternative()), fields)),
  );
  return kernelRecord(
    lane,
    new Core.TransactionUnspentOutput(position.utxo.input(), output),
  );
}
it.each(["list", "map"])(
  "decodes bounded bulk %s beyond 100 entries",
  (kind) => {
    const bulk = changedPosition(record(actions[3]), (fields) => {
      if (kind === "list")
        fields[3] = pd.list(
          Array.from({ length: 101 }, (_, i) =>
            pd.bytes(i.toString(16).padStart(4, "0")),
          ),
        );
      else
        fields[6] = pd.map(
          Array.from({ length: 101 }, (_, i) => [
            pd.list([
              pd.bytes(native.policyId),
              pd.bytes(i.toString(16).padStart(4, "0")),
            ]),
            pd.int(1n),
          ]),
        );
    });
    expect(
      kind === "list" ? bulk.fields.nft_names : bulk.fields.sale_price,
    ).toHaveLength(101);
  },
);
it("decodes signed schema integers but rejects a negative swap price before quoting", () => {
  const signed = changedPosition(record(actions[4]), (fields) => {
    fields[8] = pd.con(0, [pd.int(-1n), pd.int(1n)]);
  });
  expect(() => quoteKernelSwap(signed, 1n)).toThrow(/positive/);
});
it("rejects unsupported swap tokens before quoting", () => {
  const original = record(actions[4]);
  const polluted = changedPosition(original, (_fields, assets) => {
    assets.set(Core.AssetId("55".repeat(28) + "01"), 1n);
  });
  expect(() => quoteKernelSwap(polluted, 1n)).toThrow(/unsupported assets/);
});
it("rejects reversed two-way asset ordering before quoting", () => {
  const reversed = changedPosition(
    record(actions[4]),
    (fields, assets) => {
      fields[0] = pd.bytes(KERNEL_LANES["two-way"].beaconPolicy);
      fields.splice(9, 0, pd.con(0, [pd.int(1n), pd.int(1n)]));
      for (const [unit, q] of [...assets])
        if (unit.startsWith(KERNEL_LANES["one-way"].beaconPolicy)) {
          assets.delete(unit);
          assets.set(
            Core.AssetId(KERNEL_LANES["two-way"].beaconPolicy + unit.slice(56)),
            q,
          );
        }
    },
    "two-way",
  );
  expect(() => quoteKernelSwap(reversed, 1n)).toThrow(/direction/);
});
it("rejects unrelated proposal-policy assets rather than moving them to buyer change", () => {
  const position = changedPosition(record(actions[2]), (_fields, assets) =>
    assets.set(
      Core.AssetId(KERNEL_LANES["option-proposals"].beaconPolicy + "ffff"),
      1n,
    ),
  );
  expect(() =>
    kernelLifecyclePlan(
      {
        kind: "option-purchase",
        record: position,
        termsIndex: 0,
        paymentDeposit: 5000000n,
        contractTopUp: 0n,
      },
      stake,
      1700000000000,
    ),
  ).toThrow(/extra proposal-policy/);
});
it("selects compatible collateral rather than blindly using the first offer entry", () => {
  const ask = record(actions[0]);
  const offer = changedPosition(
    record({ ...actions[1], borrowerStakeHash: stake } as KernelCreation),
    (fields) => {
      fields[13] = pd.map([
        [
          pd.list([pd.bytes("22".repeat(28)), pd.bytes("01")]),
          pd.list([pd.int(1n), pd.int(1n)]),
        ],
        [
          pd.list([pd.bytes(native.policyId), pd.bytes(native.name)]),
          pd.list([pd.int(1n), pd.int(1000000n)]),
        ],
      ]);
    },
  );
  expect(loanCollateralChoices(ask, offer)).toEqual([native]);
  const action = {
    kind: "loan-accept" as const,
    ask,
    offer,
    collateralDeposit: 5000000n,
    lenderTopUp: 0n,
    collateral: native,
  };
  expect(
    kernelLifecyclePlan(action, stake, 1700000000000)
      .outputs[0].amount()
      .multiasset()
      ?.get(Core.AssetId(native.policyId + native.name)),
  ).toBe(10n);
  expect(() =>
    kernelLifecyclePlan(
      { ...action, collateral: { policyId: "22".repeat(28), name: "01" } },
      stake,
      1700000000000,
    ),
  ).toThrow(/allowed by both/);
});
