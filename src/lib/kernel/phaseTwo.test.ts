// @vitest-environment node
import { Blaze, ColdWallet, Core, Provider } from "@blaze-cardano/sdk";
import { makeUplcEvaluator } from "@blaze-cardano/vm";
import { beforeAll, expect, it, vi } from "vitest";
import { assertDingoTransactionBackends } from "../dingo/walletSession";
import type { Cip30WalletApi } from "../dingo/cip30";
import { getBlaze } from "../dingo/blaze";
import { blockfrostFetch } from "../dingo/blockfrost";
import { DingoProvider } from "../dingo/utxorpc/DingoProvider";
import {
  prepareKernelTransaction,
  type KernelAction,
  type KernelDraft,
} from "./transactions";
import { ADA, pd } from "./actions";
import { kernelRecord } from "./markets";
import {
  phaseTwoParams,
  phaseTwoReferences,
  phaseTwoScripts,
} from "./phaseTwo.fixture";
vi.mock("../dingo/config", () => ({
  DINGO_NETWORK: { id: "preprod", label: "Preprod", networkMagic: 1 },
  DINGO_CONFIG: {
    blockfrostUrl: "http://127.0.0.1:3000",
    utxorpcUrl: "http://127.0.0.1:9090",
  },
}));
vi.mock("../dingo/walletSession", async (original) => ({
  ...(await original<typeof import("../dingo/walletSession")>()),
  assertDingoTransactionBackends: vi.fn(),
}));
vi.mock("../dingo/blaze", async (original) => ({
  ...(await original<typeof import("../dingo/blaze")>()),
  getBlaze: vi.fn(),
}));
vi.mock("../dingo/blockfrost", async (original) => ({
  ...(await original<typeof import("../dingo/blockfrost")>()),
  blockfrostFetch: vi.fn(),
}));
beforeAll(() => Core.initCrypto());
const collateralAsset = { policyId: "33".repeat(28), name: "01" };
const nft = { policyId: "44".repeat(28), name: "53504f54" };
const baseSlot = 138000000;
const slotTime = (slot: number) =>
  Core.SLOT_CONFIG_NETWORK.Preprod.zeroTime +
  (slot - Core.SLOT_CONFIG_NETWORK.Preprod.zeroSlot) *
    Core.SLOT_CONFIG_NETWORK.Preprod.slotLength;
const point = (input: Core.TransactionInput) =>
  `${input.transactionId()}#${input.index()}`;
class MemoryProvider extends Provider {
  ledger = new Map<string, Core.TransactionUnspentOutput>();
  evaluations = 0;
  postAttempts = 0;
  slot = baseSlot;
  readonly params: Core.ProtocolParameters;
  constructor(params: Core.ProtocolParameters) {
    super(Core.NetworkId.Testnet, "cardano-preprod");
    this.params = params;
  }
  async getParameters() {
    return this.params;
  }
  async getUnspentOutputs(address: Core.Address) {
    return [...this.ledger.values()].filter(
      (utxo) => utxo.output().address().toBytes() === address.toBytes(),
    );
  }
  async getUnspentOutputsWithAsset(address: Core.Address, unit: Core.AssetId) {
    return (await this.getUnspentOutputs(address)).filter(
      (utxo) => (utxo.output().amount().multiasset()?.get(unit) ?? 0n) > 0n,
    );
  }
  async getUnspentOutputByNFT(unit: Core.AssetId) {
    const values = [...this.ledger.values()].filter(
      (utxo) => (utxo.output().amount().multiasset()?.get(unit) ?? 0n) > 0n,
    );
    if (values.length !== 1) throw new Error("NFT output is not unique");
    return values[0];
  }
  async resolveUnspentOutputs(inputs: Core.TransactionInput[]) {
    return inputs.map((input) => {
      const value = this.ledger.get(point(input));
      if (!value) throw new Error("Virtual output not found: " + point(input));
      return value;
    });
  }
  async resolveDatum(): Promise<Core.PlutusData> {
    throw new Error("No hashed datum in this fixture");
  }
  async resolveScriptRef(script: Core.Script | Core.Hash28ByteBase16) {
    const hash = typeof script === "string" ? script : script.hash();
    return [...this.ledger.values()].find(
      (utxo) => utxo.output().scriptRef()?.hash() === hash,
    );
  }
  async awaitTransactionConfirmation(): Promise<boolean> {
    throw new Error("No confirmation API in this fixture");
  }
  async postTransactionToChain(): Promise<Core.TransactionId> {
    this.postAttempts++;
    throw new Error("Submission is prohibited in phase-two fixtures");
  }
  async evaluateTransaction(
    tx: Core.Transaction,
    additional: Core.TransactionUnspentOutput[],
  ) {
    this.evaluations++;
    const values = new Map(
      [...this.ledger.values(), ...additional].map((utxo) => [
        point(utxo.input()),
        utxo,
      ]),
    );
    return makeUplcEvaluator(
      this.params,
      1,
      1,
      Core.SLOT_CONFIG_NETWORK.Preprod,
    )(tx, [...values.values()]);
  }

  apply(draft: KernelDraft) {
    for (const input of draft.tx.body().inputs().values())
      this.ledger.delete(point(input));
    draft.tx
      .body()
      .outputs()
      .forEach((output, index) => {
        const utxo = new Core.TransactionUnspentOutput(
          new Core.TransactionInput(draft.tx.getId(), BigInt(index)),
          output,
        );
        this.ledger.set(point(utxo.input()), utxo);
      });
  }
}
async function fixture() {
  vi.mocked(assertDingoTransactionBackends).mockResolvedValue();
  const state: { provider?: MemoryProvider } = {};
  vi.mocked(blockfrostFetch).mockImplementation(async <T>(path: string) => {
    if (path === "/api/v0/epochs/latest/parameters") return phaseTwoParams as T;
    if (path === "/api/v0/blocks/latest")
      return {
        slot: state.provider?.slot ?? baseSlot,
        time: slotTime(state.provider?.slot ?? baseSlot) / 1000,
      } as T;
    throw new Error("Unexpected fixture read: " + path);
  });
  const params = await new DingoProvider().getParameters();
  const ledger = new MemoryProvider(params);
  state.provider = ledger;
  const scripts = new Map(
    Object.values(phaseTwoScripts)
      .flatMap((scripts) => Object.values(scripts))
      .map((script) => [script.hash, script.code]),
  );
  for (const ref of phaseTwoReferences) {
    const code = scripts.get(ref.scriptHash);
    if (!code) throw new Error("Missing published script");
    const output = new Core.TransactionOutput(
      Core.Address.fromBech32(ref.address),
      new Core.Value(
        BigInt(ref.amount.find((asset) => asset.unit === "lovelace")!.quantity),
      ),
    );
    output.setScriptRef(
      Core.Script.newPlutusV2Script(
        new Core.PlutusV2Script(Core.HexBlob(code)),
      ),
    );
    if (ref.datum)
      output.setDatum(
        Core.Datum.newInlineData(
          Core.PlutusData.fromCbor(Core.HexBlob(ref.datum)),
        ),
      );
    const utxo = new Core.TransactionUnspentOutput(
      new Core.TransactionInput(
        Core.TransactionId(ref.hash),
        BigInt(ref.index),
      ),
      output,
    );
    ledger.ledger.set(point(utxo.input()), utxo);
    expect(output.scriptRef()!.hash()).toBe(ref.scriptHash);
  }
  const wallets = new Map<
    Cip30WalletApi,
    Awaited<ReturnType<typeof getBlaze>>
  >();
  const wallet = async (prefix: string) => {
    const stake = prefix.repeat(28),
      address = Core.addressFromCredentials(
        0,
        Core.Credential.fromCore({
          type: Core.CredentialType.KeyHash,
          hash: Core.Hash28ByteBase16(stake),
        }),
        Core.Credential.fromCore({
          type: Core.CredentialType.KeyHash,
          hash: Core.Hash28ByteBase16(stake),
        }),
      );
    const reward = Core.RewardAddress.fromCredentials(0, {
      type: Core.CredentialType.KeyHash,
      hash: Core.Hash28ByteBase16(stake),
    }).toAddress();
    for (let index = 0; index < 4; index++) {
      const tokens =
        index === 0
          ? new Map([
              [
                Core.AssetId(collateralAsset.policyId + collateralAsset.name),
                1000000n,
              ],
              ...(prefix === "22"
                ? [
                    [Core.AssetId(nft.policyId + nft.name), 1n] as [
                      Core.AssetId,
                      bigint,
                    ],
                  ]
                : []),
            ])
          : undefined;
      const utxo = new Core.TransactionUnspentOutput(
        new Core.TransactionInput(
          Core.TransactionId(prefix.repeat(32)),
          BigInt(index),
        ),
        new Core.TransactionOutput(
          address,
          new Core.Value(index === 0 ? 10000000000n : 50000000n, tokens),
        ),
      );
      ledger.ledger.set(point(utxo.input()), utxo);
    }
    const api = {
      getNetworkId: async () => 0,
      getRewardAddresses: async () => [reward.toBytes()],
    } as unknown as Cip30WalletApi;
    const blaze = await Blaze.from(
      ledger,
      new ColdWallet(address, Core.NetworkId.Testnet, ledger),
    );
    wallets.set(api, { blaze } as unknown as Awaited<
      ReturnType<typeof getBlaze>
    >);
    return { api, stake, address };
  };
  const borrower = await wallet("11"),
    writer = await wallet("22");
  vi.mocked(getBlaze).mockImplementation(async (api) => {
    const handle = wallets.get(api);
    if (!handle) throw new Error("Unknown fixture wallet");
    return handle;
  });
  const build = async (api: Cip30WalletApi, action: KernelAction) => {
    const before = ledger.evaluations;
    const draft = await prepareKernelTransaction(api, action, () => {});
    expect(ledger.evaluations).toBeGreaterThan(before);
    expect(
      draft.tx
        .witnessSet()
        .redeemers()!
        .values()
        .every(
          (redeemer) =>
            redeemer.exUnits().mem() > 0n && redeemer.exUnits().steps() > 0n,
        ),
    ).toBe(true);
    expect(ledger.postAttempts).toBe(0);
    return draft;
  };
  const asRecord = (
    draft: KernelDraft,
    index: number,
    lane: Parameters<typeof kernelRecord>[0],
  ) =>
    kernelRecord(
      lane,
      new Core.TransactionUnspentOutput(
        new Core.TransactionInput(draft.tx.getId(), BigInt(index)),
        draft.tx.body().outputs()[index],
      ),
    );
  return { ledger, borrower, writer, build, asRecord };
}
it("executes published options creation, purchase, exercise and expired reclaim validators", async () => {
  const f = await fixture();
  const proposal = await f.build(f.writer.api, {
    kind: "option-proposal",
    offer: ADA,
    offerQuantity: 10000000n,
    ask: collateralAsset,
    premium: ADA,
    premiumQuantity: 1000000n,
    strike: { numerator: 1n, denominator: 1000000n },
    expiresAt: slotTime(baseSlot) + 3 * 86400000,
    deposit: 5000000n,
  });
  f.ledger.apply(proposal);
  const position = f.asRecord(proposal, 0, "option-proposals");
  const purchase = await f.build(f.borrower.api, {
    kind: "option-purchase",
    record: position,
    termsIndex: 0,
    paymentDeposit: 5000000n,
    contractTopUp: 5000000n,
  });
  f.ledger.apply(purchase);
  const active = f.asRecord(purchase, 1, "option-active");
  const snapshot = new Map(f.ledger.ledger);
  f.ledger.slot += 4 * 86400;
  await f.build(f.writer.api, { kind: "option-expired-close", record: active });
  f.ledger.ledger = snapshot;
  f.ledger.slot = baseSlot;
  const exercise = await f.build(f.borrower.api, {
    kind: "option-exercise",
    record: active,
    paymentDeposit: 5000000n,
  });
  expect(exercise.tx.witnessSet().redeemers()!.size()).toBe(2);
}, 30000);
it("executes the published Spot listing and purchase validators with its payment observer", async () => {
  const f = await fixture();
  const sale = await f.build(f.writer.api, {
    kind: "spot-sale",
    nft,
    price: 10000000n,
    deposit: 5000000n,
  });
  f.ledger.apply(sale);
  const listing = f.asRecord(sale, 0, "aftermarket");
  const purchase = await f.build(f.borrower.api, {
    kind: "spot-purchase",
    record: listing,
    paymentDeposit: 5000000n,
  });
  expect(purchase.tx.witnessSet().redeemers()!.size()).toBe(3);
}, 30000);
it.each([false, true])(
  "executes published loan lifecycle validators with compounding=%s",
  async (compounding) => {
    const f = await fixture();
    const ask = await f.build(f.borrower.api, {
      kind: "loan-ask",
      principal: 10000000n,
      termDays: 30,
      collateral: collateralAsset,
      deposit: 5000000n,
    });
    f.ledger.apply(ask);
    const offer = await f.build(f.writer.api, {
      kind: "loan-offer",
      borrowerStakeHash: f.borrower.stake,
      principal: 10000000n,
      termDays: 30,
      interest: { numerator: 1n, denominator: 10n },
      collateral: collateralAsset,
      collateralRatio: { numerator: 1n, denominator: 1000000n },
      claimDays: 7,
      deposit: 5000000n,
    });
    f.ledger.apply(offer);
    const baseOffer = f.asRecord(offer, 0, "loan-negotiation");
    const offerFields = Core.PlutusData.fromCbor(
      Core.HexBlob(baseOffer.datumCbor),
    )
      .asConstrPlutusData()!
      .getData();
    const multiFields = Array.from(
      { length: offerFields.getLength() },
      (_, i) => offerFields.get(i),
    );
    multiFields[13] = pd.map([
      [
        pd.list([pd.bytes("22".repeat(28)), pd.bytes("01")]),
        pd.list([pd.int(1n), pd.int(1n)]),
      ],
      [
        pd.list([
          pd.bytes(collateralAsset.policyId),
          pd.bytes(collateralAsset.name),
        ]),
        pd.list([pd.int(1n), pd.int(1000000n)]),
      ],
    ]);
    const multiOutput = new Core.TransactionOutput(
      baseOffer.utxo.output().address(),
      Core.Value.fromCbor(baseOffer.utxo.output().amount().toCbor()),
    );
    multiOutput.setDatum(Core.Datum.newInlineData(pd.con(1, multiFields)));
    const multiUtxo = new Core.TransactionUnspentOutput(
      baseOffer.utxo.input(),
      multiOutput,
    );
    f.ledger.ledger.set(point(multiUtxo.input()), multiUtxo);
    const multiOffer = kernelRecord("loan-negotiation", multiUtxo);
    await expect(
      f.build(f.borrower.api, {
        kind: "loan-accept",
        ask: f.asRecord(ask, 0, "loan-negotiation"),
        offer: multiOffer,
        collateral: collateralAsset,
        collateralDeposit: 5000000n,
        lenderTopUp: 1n,
      }),
    ).rejects.toThrow("exact on-chain offer deposit");
    const accepted = await f.build(f.borrower.api, {
      kind: "loan-accept",
      ask: f.asRecord(ask, 0, "loan-negotiation"),
      offer: multiOffer,
      collateral: collateralAsset,
      collateralDeposit: 5000000n,
      lenderTopUp: 0n,
    });
    f.ledger.apply(accepted);
    const active = f.asRecord(accepted, 0, "loan-active");
    const original = new Map(f.ledger.ledger);
    f.ledger.slot = baseSlot + 31 * 86400;
    await f.build(f.writer.api, {
      kind: "loan-claim",
      record: active,
      claimant: "lender",
    });
    f.ledger.ledger = new Map(original);
    // Loan-key ownership is transferable; it does not require the original lender stake key.
    const lenderKey = f.asRecord(accepted, 0, "loan-active").fields.loan_id;
    const keyUnit = Core.AssetId(
      String(active.fields.active_beacon_id) + String(lenderKey),
    );
    const keyUtxo = [...f.ledger.ledger.values()].find(
      (utxo) =>
        utxo.output().address().toBytes() === f.writer.address.toBytes() &&
        utxo.output().amount().multiasset()?.get(keyUnit) === 1n,
    )!;
    expect(keyUtxo).toBeDefined();
    const transferred = new Core.TransactionOutput(
      f.borrower.address,
      Core.Value.fromCbor(keyUtxo.output().amount().toCbor()),
    );
    if (keyUtxo.output().datum())
      transferred.setDatum(
        Core.Datum.fromCbor(keyUtxo.output().datum()!.toCbor()),
      );
    f.ledger.ledger.set(
      point(keyUtxo.input()),
      new Core.TransactionUnspentOutput(keyUtxo.input(), transferred),
    );
    await f.build(f.borrower.api, {
      kind: "loan-claim",
      record: active,
      claimant: "lender",
    });
    f.ledger.ledger = new Map(original);
    f.ledger.slot = baseSlot + 38 * 86400;
    await f.build(f.borrower.api, {
      kind: "loan-claim",
      record: active,
      claimant: "borrower",
    });
    f.ledger.ledger = new Map(original);
    f.ledger.slot = baseSlot;
    // Decoded SDK outputs retain their original CBOR after setDatum.
    const periodicOutput = new Core.TransactionOutput(
      active.utxo.output().address(),
      Core.Value.fromCbor(active.utxo.output().amount().toCbor()),
    );
    periodicOutput.setDatum(
      Core.Datum.newInlineData(active.utxo.output().datum()!.asInlineData()!),
    );
    const originalDatum = periodicOutput.datum()!.asInlineData()!;
    const values = originalDatum.asConstrPlutusData()!.getData();
    const changed = Array.from({ length: values.getLength() }, (_, index) =>
      values.get(index),
    );
    changed[9] = pd.con(0, [pd.int(86400000n)]);
    changed[13] = pd.con(compounding ? 1 : 0);

    periodicOutput.setDatum(Core.Datum.newInlineData(pd.con(2, changed)));
    expect(
      Core.TransactionOutput.fromCbor(periodicOutput.toCbor())
        .datum()!
        .asInlineData()!
        .toCbor(),
    ).toBe(pd.con(2, changed).toCbor());
    const periodicUtxo = new Core.TransactionUnspentOutput(
      active.utxo.input(),
      periodicOutput,
    );
    f.ledger.ledger.set(point(periodicUtxo.input()), periodicUtxo);
    f.ledger.slot = baseSlot + 2 * 86400;
    await f.build(f.borrower.api, {
      kind: "loan-accrue",
      record: kernelRecord("loan-active", periodicUtxo),
      times: 1,
      depositTopUp: 0n,
    });
    f.ledger.ledger = new Map(original);
    f.ledger.slot = baseSlot;
    const repayment = await f.build(f.borrower.api, {
      kind: "loan-repay",
      record: f.asRecord(accepted, 0, "loan-active"),
      paymentDeposit: 5000000n,
    });
    expect(repayment.tx.witnessSet().redeemers()!.size()).toBe(3);
  },
  30000,
);
