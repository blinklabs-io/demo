import { positionBeacons } from "./beacons";
import { Core } from "@blaze-cardano/sdk";
import { pd } from "./actions";
import { kernelRecord, type KernelRecord } from "./markets";
import { KERNEL_LANES, KERNEL_OBSERVERS, type KernelLane } from "./protocol";
export type KernelLifecycle =
  | {
      kind: "loan-accrue";
      record: KernelRecord;
      times: number;
      depositTopUp: bigint;
    }
  | {
      kind: "loan-claim";
      record: KernelRecord;
      claimant: "borrower" | "lender";
    }
  | { kind: "option-expired-close"; record: KernelRecord }
  | {
      kind: "option-purchase";
      record: KernelRecord;
      termsIndex: number;
      paymentDeposit: bigint;
      contractTopUp: bigint;
    }
  | { kind: "option-exercise"; record: KernelRecord; paymentDeposit: bigint }
  | { kind: "spot-purchase"; record: KernelRecord; paymentDeposit: bigint }
  | {
      kind: "loan-accept";
      ask: KernelRecord;
      offer: KernelRecord;
      collateralDeposit: bigint;
      lenderTopUp: bigint;
    }
  | { kind: "loan-repay"; record: KernelRecord; paymentDeposit: bigint };
function fields(data: Core.PlutusData) {
  const constructor = data.asConstrPlutusData();
  if (!constructor) throw new Error("Expected Kernel datum record.");
  const values = constructor.getData();
  return Array.from({ length: values.getLength() }, (_, index) =>
    values.get(index),
  );
}
function raw(record: KernelRecord, lane: KernelLane, kind: string) {
  const verified = kernelRecord(lane, record.utxo);
  if (record.lane !== lane || verified.kind !== kind)
    throw new Error("Choose the matching Kernel position.");
  return fields(Core.PlutusData.fromCbor(Core.HexBlob(verified.datumCbor)));
}
function integer(data: Core.PlutusData) {
  const value = data.asInteger();
  if (value === undefined || value < 0n)
    throw new Error("Invalid Kernel amount.");
  return value;
}
function bytes(data: Core.PlutusData) {
  const value = data.asBoundedBytes();
  if (!value) throw new Error("Invalid Kernel bytes.");
  return Core.toHex(value);
}
function list(data: Core.PlutusData) {
  const values = data.asList();
  if (!values) throw new Error("Expected Kernel list.");
  return Array.from({ length: values.getLength() }, (_, index) =>
    values.get(index),
  );
}
function ratio(data: Core.PlutusData) {
  const values = list(data);
  if (values.length !== 2) throw new Error("Invalid fraction.");
  const n = integer(values[0]),
    d = integer(values[1]);
  if (!d) throw new Error("Fraction denominator must be positive.");
  return [n, d] as const;
}
function reduced(n: bigint, d: bigint) {
  let a = n,
    b = d;
  while (b) {
    const remainder = a % b;
    a = b;
    b = remainder;
  }
  return pd.list([pd.int(n / a), pd.int(d / a)]);
}
function paymentAddress(data: Core.PlutusData) {
  const [payment, stake] = fields(data);
  const toCredential = (value: Core.PlutusData) => {
    const tag = value.asConstrPlutusData()?.getAlternative();
    const hash = bytes(fields(value)[0]);
    if ((tag !== 0n && tag !== 1n) || hash.length !== 56)
      throw new Error("Invalid Kernel payment credential.");
    return Core.Credential.fromCore({
      type: Number(tag),
      hash: Core.Hash28ByteBase16(hash),
    });
  };
  const paymentCred = toCredential(payment),
    option = stake.asConstrPlutusData();
  if (option?.getAlternative() === 1n)
    return Core.addressFromCredential(0, paymentCred);
  const referenced = fields(stake)[0];
  if (referenced.asConstrPlutusData()?.getAlternative() === 1n) {
    const [slot, tx, cert] = fields(referenced).map(integer);
    if (
      !Number.isSafeInteger(Number(tx)) ||
      !Number.isSafeInteger(Number(cert))
    )
      throw new Error("Pointer indices exceed the SDK integer range.");
    return Core.Cardano.PointerAddress.fromCredentials(
      0,
      paymentCred.toCore(),
      {
        slot,
        txIndex: Core.Cardano.TxIndex(Number(tx)),
        certIndex: Core.Cardano.CertIndex(Number(cert)),
      },
    ).toAddress();
  }
  return Core.addressFromCredentials(
    0,
    paymentCred,
    toCredential(fields(referenced)[0]),
  );
}
function output(
  address: Core.Address,
  value: Core.Value,
  datum: Core.PlutusData,
) {
  const result = new Core.TransactionOutput(address, value);
  result.setDatum(Core.Datum.newInlineData(datum));
  return result;
}
function value(asset: Core.PlutusData, quantity: bigint, deposit: bigint) {
  const [policy, name] = list(asset).map(bytes);
  if (deposit < 0n || quantity < 0n)
    throw new Error("Amounts must be nonnegative.");
  if (!policy && name) throw new Error("Invalid ADA asset.");
  return new Core.Value(
    deposit + (policy ? 0n : quantity),
    policy ? new Map([[Core.AssetId(policy + name), quantity]]) : undefined,
  );
}

function id(record: KernelRecord) {
  const suffix = Core.toHex(
    new TextEncoder().encode(String(record.utxo.input().index())),
  );
  return String(
    Core.sha2_256(Core.HexBlob(record.utxo.input().transactionId() + suffix)),
  );
}
function paymentDatum(policy: string, name: string) {
  return pd.list([pd.bytes(policy), pd.bytes(name)]);
}
function outRef(record: KernelRecord) {
  return pd.con(0, [
    pd.con(0, [pd.bytes(record.utxo.input().transactionId())]),
    pd.int(record.utxo.input().index()),
  ]);
}
const utf8 = (text: string) => Core.toHex(new TextEncoder().encode(text));
export type KernelTransitionPlan = {
  inputs: { record: KernelRecord; redeemer: Core.PlutusData }[];
  outputs: Core.TransactionOutput[];
  mints: {
    lane: KernelLane;
    assets: Map<Core.AssetName, bigint>;
    redeemer: Core.PlutusData;
  }[];
  references: KernelLane[];
  observer?: { hash: string; ref: string; redeemer: Core.PlutusData };
  requiredKey?: string;
  expiration?: number;
  start?: number;
  description: string;
};
export function kernelLifecyclePlan(
  action: KernelLifecycle,
  stakeHash: string | undefined,
  startTime: number,
): KernelTransitionPlan {
  if ("paymentDeposit" in action && action.paymentDeposit < 0n)
    throw new Error("Payment deposit must be nonnegative.");
  const plan: KernelTransitionPlan = {
    inputs: [],
    outputs: [],
    mints: [],
    references: [],
    description: "",
  };
  const options = KERNEL_LANES["option-active"].beaconPolicy,
    proposals = KERNEL_LANES["option-proposals"].beaconPolicy,
    loans = KERNEL_LANES["loan-active"].beaconPolicy,
    negotiation = KERNEL_LANES["loan-negotiation"].beaconPolicy;
  if (action.kind === "option-expired-close") {
    const d = raw(action.record, "option-active", "ActiveDatum"),
      owner = action.record.utxo.output().address().getProps().delegationPart;
    if (
      !stakeHash ||
      owner?.type !== Core.CredentialType.KeyHash ||
      owner.hash !== stakeHash
    )
      throw new Error("Only the writer can reclaim this expired option.");
    if (integer(d[10]) > BigInt(startTime))
      throw new Error("The option has not expired.");
    plan.inputs = [{ record: action.record, redeemer: pd.con(3) }];
    plan.mints = [
      {
        lane: "option-active",
        assets: positionBeacons(action.record, -1n),
        redeemer: pd.con(0, [pd.bytes(proposals)]),
      },
    ];
    plan.references = ["option-active"];
    plan.requiredKey = stakeHash;
    plan.start = startTime;
    plan.description = "Reclaim your expired options offer";
  } else if (action.kind === "loan-claim") {
    const d = raw(action.record, "loan-active", "ActiveDatum"),
      borrower = action.claimant === "borrower";
    if (borrower && (!stakeHash || bytes(d[4]) !== stakeHash))
      throw new Error("Only the borrower can unlock lost collateral.");
    if (integer(d[borrower ? 18 : 19]) > BigInt(startTime))
      throw new Error(
        borrower
          ? "The lender claim period has not ended."
          : "The loan has not expired.",
      );
    const burns = positionBeacons(action.record, -1n);
    if (!borrower) burns.set(Core.AssetName(bytes(d[22])), -2n);
    plan.inputs = [
      { record: action.record, redeemer: pd.con(borrower ? 7 : 5) },
    ];
    plan.mints = [
      {
        lane: "loan-active",
        assets: burns,
        redeemer: pd.con(borrower ? 2 : 1),
      },
    ];
    plan.references = ["loan-active"];
    plan.requiredKey = borrower ? stakeHash : undefined;
    plan.start = startTime;
    plan.description = borrower
      ? "Unlock your collateral after the lender claim period"
      : "Use your loan key to claim expired collateral";
  } else if (action.kind === "loan-accrue") {
    const d = raw(action.record, "loan-active", "ActiveDatum"),
      epoch = d[9].asConstrPlutusData();
    if (!stakeHash || bytes(d[4]) !== stakeHash)
      throw new Error("Only this loan's borrower can apply interest.");
    plan.requiredKey = stakeHash;
    if (epoch?.getAlternative() !== 0n)
      throw new Error("This loan has no periodic interest epochs.");
    const duration = integer(fields(d[9])[0]),
      boundary = integer(d[10]);
    if (
      !duration ||
      !Number.isSafeInteger(action.times) ||
      action.times < 1 ||
      action.times > 24 ||
      boundary + duration * BigInt(action.times) > BigInt(startTime) ||
      action.depositTopUp < 0n
    )
      throw new Error(
        "Choose 1–24 elapsed loan epochs and a nonnegative deposit top-up.",
      );
    const compounding = d[13].asConstrPlutusData()?.getAlternative() === 1n,
      [interestN, interestD] = compounding ? ratio(d[12]) : [0n, 1n];
    let [n, den] = ratio(d[20]);
    const penalty = d[15].asConstrPlutusData();
    let penalize = integer(d[14]) > integer(d[21]);
    for (let index = 0; index < action.times; index++) {
      if (penalize && penalty?.getAlternative() === 1n)
        n += integer(fields(d[15])[0]) * den;
      else if (penalize && penalty?.getAlternative() === 2n) {
        const [pn, pdDen] = ratio(fields(d[15])[0]);
        n *= pdDen + pn;
        den *= pdDen;
      }
      n *= interestD + interestN;
      den *= interestD;
      penalize = true;
    }
    const next = [...d];
    next[10] = pd.int(boundary + duration * BigInt(action.times));
    next[20] = reduced(n, den);
    next[21] = pd.int(0n);
    plan.inputs = [
      {
        record: action.record,
        redeemer: pd.con(4, [
          pd.int(action.depositTopUp),
          pd.int(BigInt(action.times)),
        ]),
      },
    ];
    plan.outputs = [
      output(
        action.record.utxo.output().address(),
        new Core.Value(
          action.record.lovelace + action.depositTopUp,
          new Map(action.record.utxo.output().amount().multiasset()),
        ),
        pd.con(2, next),
      ),
    ];
    plan.references = ["loan-active"];
    plan.observer = { ...KERNEL_OBSERVERS.loanInterest, redeemer: pd.con(0) };
    plan.expiration = Number(integer(d[19]));
    plan.description = "Apply elapsed loan interest and recorded penalties";
  } else if (action.kind === "option-purchase") {
    const d = raw(action.record, "option-proposals", "ProposalDatum"),
      terms = list(d[12]);
    if (
      !Number.isSafeInteger(action.termsIndex) ||
      action.termsIndex < 0 ||
      action.termsIndex >= terms.length
    )
      throw new Error("Choose valid options terms.");
    const t = fields(terms[action.termsIndex]);
    if (action.contractTopUp < 0n || action.paymentDeposit < 0n)
      throw new Error("Deposits must be nonnegative.");
    const contract = id(action.record),
      observer = KERNEL_OBSERVERS.optionAddress.hash;
    const active = pd.con(1, [
      d[0],
      d[1],
      pd.bytes(observer),
      d[2],
      d[3],
      d[4],
      d[5],
      d[6],
      d[7],
      t[1],
      t[2],
      d[10],
      d[11],
      pd.bytes(contract),
    ]);
    const assets = new Map(action.record.utxo.output().amount().multiasset());
    for (const key of assets.keys())
      if (key.startsWith(proposals)) assets.delete(key);
    const mint = new Map<Core.AssetName, bigint>();
    for (const name of [bytes(d[5]), bytes(d[6]), bytes(d[7]), contract]) {
      mint.set(
        Core.AssetName(name),
        (mint.get(Core.AssetName(name)) ?? 0n) + 1n,
      );
      assets.set(
        Core.AssetId(options + name),
        (assets.get(Core.AssetId(options + name)) ?? 0n) + 1n,
      );
    }
    mint.set(Core.AssetName(contract), 2n);
    plan.outputs = [
      output(
        paymentAddress(d[11]),
        value(d[8], integer(t[0]), action.paymentDeposit),
        paymentDatum(options, contract),
      ),
      output(
        action.record.utxo.output().address(),
        new Core.Value(action.record.lovelace + action.contractTopUp, assets),
        active,
      ),
    ];
    plan.inputs = [
      {
        record: action.record,
        redeemer: pd.con(1, [pd.int(BigInt(action.termsIndex))]),
      },
    ];
    plan.mints = [
      {
        lane: "option-proposals",
        assets: positionBeacons(action.record, -1n),
        redeemer: pd.con(0),
      },
      {
        lane: "option-active",
        assets: mint,
        redeemer: pd.con(0, [pd.bytes(proposals)]),
      },
    ];
    plan.references = ["option-proposals", "option-active"];
    plan.expiration = Number(integer(t[2]));
    plan.description = "Purchase an options contract and pay its premium";
  } else if (action.kind === "option-exercise") {
    const d = raw(action.record, "option-active", "ActiveDatum"),
      [n, den] = ratio(d[9]),
      due = (integer(d[4]) * n + den - 1n) / den,
      contract = bytes(d[13]);
    const burns = positionBeacons(action.record, -1n);
    burns.set(Core.AssetName(contract), -2n);
    plan.outputs = [
      output(
        paymentAddress(d[12]),
        value(d[5], due, integer(d[11]) + action.paymentDeposit),
        paymentDatum(options, contract),
      ),
    ];
    plan.inputs = [{ record: action.record, redeemer: pd.con(2) }];
    plan.mints = [
      {
        lane: "option-active",
        assets: burns,
        redeemer: pd.con(0, [pd.bytes(proposals)]),
      },
    ];
    plan.references = ["option-active"];
    plan.expiration = Number(integer(d[10]));
    plan.description =
      "Exercise your options key and pay the exact strike amount";
  } else if (action.kind === "spot-purchase") {
    const d = raw(action.record, "aftermarket", "SpotDatum"),
      policy = KERNEL_LANES.aftermarket.beaconPolicy,
      map = d[6].asMap();
    if (!map) throw new Error("Invalid spot price map.");
    let coin = integer(d[5]) + action.paymentDeposit;
    const assets = new Map<Core.AssetId, bigint>();
    for (const key of Array.from({ length: map.getLength() }, (_, i) =>
      map.getKeys().get(i),
    )) {
      const [p, n] = list(key).map(bytes),
        amount = integer(map.get(key)!);
      if (!p) coin += amount;
      else assets.set(Core.AssetId(p + n), amount);
    }
    plan.outputs = [
      output(
        paymentAddress(d[4]),
        new Core.Value(coin, assets),
        pd.list([pd.bytes(policy), outRef(action.record)]),
      ),
    ];
    plan.inputs = [{ record: action.record, redeemer: pd.con(2) }];
    plan.mints = [
      {
        lane: "aftermarket",
        assets: positionBeacons(action.record, -1n),
        redeemer: pd.con(0),
      },
    ];
    plan.references = ["aftermarket"];
    plan.observer = {
      ...KERNEL_OBSERVERS.aftermarket,
      redeemer: pd.con(0, [pd.bytes(policy)]),
    };
    plan.description = "Buy the listed NFT bundle at its exact on-chain price";
  } else if (action.kind === "loan-accept") {
    if (!stakeHash || !/^[a-f\d]{56}$/.test(stakeHash))
      throw new Error("A borrower stake signing key is required.");
    const ask = raw(action.ask, "loan-negotiation", "AskDatum"),
      offer = raw(action.offer, "loan-negotiation", "OfferDatum");
    if (
      action.ask.outpoint === action.offer.outpoint ||
      bytes(ask[2]) !== stakeHash ||
      action.ask.address !== action.offer.address ||
      ask[3].toCbor() !== offer[4].toCbor() ||
      integer(ask[5]) !== integer(offer[6]) ||
      integer(ask[6]) !== integer(offer[8])
    )
      throw new Error(
        "Choose your matching borrower request and lender offer.",
      );
    if (action.collateralDeposit < 0n)
      throw new Error("Deposits must be nonnegative.");
    if (action.lenderTopUp !== 0n)
      throw new Error(
        "The lender output must return the exact on-chain offer deposit.",
      );
    const collateral = offer[13].asMap(),
      accepted = ask[7].asMap();
    if (!collateral || !accepted || !collateral.getLength())
      throw new Error("No supported loan collateral.");
    const key = collateral.getKeys().get(0),
      [policy, name] = list(key).map(bytes);
    if (bytes(accepted.get(pd.bytes(policy)) ?? pd.bytes("")) !== name)
      throw new Error("Borrower request does not allow the offer collateral.");
    const [n, den] = ratio(collateral.get(key)!),
      amount = (integer(offer[6]) * n + den - 1n) / den,
      loanId = id(action.offer),
      [interestN, interestD] = ratio(offer[9]);
    const start = pd.int(BigInt(startTime)),
      expiration = BigInt(startTime) + integer(offer[8]);
    const active = pd.con(2, [
      pd.bytes(loans),
      pd.bytes(KERNEL_OBSERVERS.loanPayment.hash),
      pd.bytes(KERNEL_OBSERVERS.loanInterest.hash),
      pd.bytes(KERNEL_OBSERVERS.loanAddress.hash),
      pd.bytes(stakeHash),
      offer[3],
      offer[4],
      offer[5],
      offer[6],
      offer[7],
      start,
      offer[8],
      offer[9],
      offer[10],
      offer[11],
      offer[12],
      offer[13],
      offer[14],
      pd.int(expiration + integer(offer[15])),
      pd.int(expiration),
      reduced(integer(offer[6]) * (interestD + interestN), interestD),
      pd.int(0n),
      pd.bytes(loanId),
    ]);
    const activeAssets = new Map<Core.AssetId, bigint>(),
      mint = new Map<Core.AssetName, bigint>();
    for (const name of [utf8("Active"), bytes(offer[5]), loanId, stakeHash]) {
      activeAssets.set(Core.AssetId(loans + name), 1n);
      mint.set(
        Core.AssetName(name),
        (mint.get(Core.AssetName(name)) ?? 0n) + 1n,
      );
    }
    mint.set(Core.AssetName(loanId), 2n);
    let coin = action.collateralDeposit;
    if (policy) activeAssets.set(Core.AssetId(policy + name), amount);
    else coin = coin > amount ? coin : amount;
    plan.outputs = [
      output(
        action.ask.utxo.output().address(),
        new Core.Value(coin, activeAssets),
        active,
      ),
      output(
        paymentAddress(offer[3]),
        new Core.Value(
          integer(offer[16]),
          new Map([[Core.AssetId(loans + loanId), 1n]]),
        ),
        paymentDatum(loans, loanId),
      ),
    ];
    const burn = positionBeacons(action.ask, -1n);
    for (const [name, q] of positionBeacons(action.offer, -1n))
      burn.set(name, (burn.get(name) ?? 0n) + q);
    plan.inputs = [
      { record: action.ask, redeemer: pd.con(2) },
      { record: action.offer, redeemer: pd.con(2) },
    ];
    plan.mints = [
      { lane: "loan-negotiation", assets: burn, redeemer: pd.con(2) },
      {
        lane: "loan-active",
        assets: mint,
        redeemer: pd.con(0, [pd.bytes(negotiation)]),
      },
    ];
    plan.references = ["loan-negotiation", "loan-active"];
    plan.requiredKey = stakeHash;
    plan.start = startTime;
    const expirationOption = offer[17].asConstrPlutusData();
    if (expirationOption?.getAlternative() === 0n)
      plan.expiration = Number(integer(fields(offer[17])[0]));
    plan.description =
      "Accept the lender offer and lock its required collateral";
  } else {
    const d = raw(action.record, "loan-active", "ActiveDatum");
    if (!stakeHash || bytes(d[4]) !== stakeHash)
      throw new Error("Only this loan's borrower can repay it.");
    const [n, den] = ratio(d[20]),
      due = (n + den - 1n) / den,
      loanId = bytes(d[22]);
    let deadline = integer(d[19]);
    const epoch = d[9].asConstrPlutusData();
    if (
      epoch?.getAlternative() === 0n &&
      ((d[13].asConstrPlutusData()?.getAlternative() === 1n &&
        ratio(d[12])[0] > 0n) ||
        d[15].asConstrPlutusData()?.getAlternative() !== 0n)
    ) {
      const boundary = integer(d[10]) + integer(fields(d[9])[0]);
      if (boundary < deadline) deadline = boundary;
    }
    plan.outputs = [
      output(
        paymentAddress(d[5]),
        value(d[6], due, action.paymentDeposit),
        paymentDatum(loans, loanId),
      ),
    ];
    plan.inputs = [
      { record: action.record, redeemer: pd.con(3, [pd.int(due)]) },
    ];
    plan.mints = [
      {
        lane: "loan-active",
        assets: positionBeacons(action.record, -1n),
        redeemer: pd.con(3),
      },
    ];
    plan.references = ["loan-active"];
    plan.observer = { ...KERNEL_OBSERVERS.loanPayment, redeemer: pd.con(0) };
    plan.requiredKey = stakeHash;
    plan.expiration = Number(deadline);
    plan.description =
      "Repay the exact outstanding loan balance and release your collateral";
  }
  if (
    plan.expiration !== undefined &&
    (!Number.isSafeInteger(plan.expiration) || plan.expiration <= startTime)
  )
    throw new Error(
      "Position deadline has passed; refresh the position before building.",
    );
  for (const minted of plan.mints)
    if (!minted.assets.size) throw new Error("Missing transition beacons.");
  return plan;
}
