import { nativeTicker } from "../format";
import { assertTransactionNetwork } from "../dingo/walletSession";
import { Blaze, ColdWallet, Core } from "@blaze-cardano/sdk";
import { parseAdaToLovelace } from "../dingo/amount";
import { blockfrostFetch } from "../dingo/blockfrost";
import { DINGO_NETWORK } from "../dingo/config";
import {
  assertDingoNetwork,
  getDingoProvider,
} from "../dingo/utxorpc/provider";
import type { Cip30WalletApi } from "../dingo/cip30";

export type Era = "ConwayEra" | "BabbageEra";
const MAX_HEX = 131072;
export function jsonValue(value: unknown): string {
  return JSON.stringify(
    value,
    (_, v) =>
      typeof v === "bigint"
        ? v.toString()
        : v instanceof Map
          ? [...v]
          : v instanceof Uint8Array
            ? Core.toHex(v)
            : v,
    2,
  );
}
function hex(value: string): string {
  const clean = value.trim();
  if (
    !clean.length ||
    clean.length > MAX_HEX ||
    clean.length % 2 ||
    !/^[0-9a-f]+$/i.test(clean)
  )
    throw new Error("Enter transaction CBOR hex (up to 64 KiB).");
  return clean.toLowerCase();
}
function parts(cbor: string): string[] {
  const reader = new Core.CborReader(Core.HexBlob(cbor));
  const length = reader.readStartArray();
  if (length !== 4 && length !== null)
    throw new Error(
      "Expected a complete Babbage or Conway transaction: [body, witnesses, script validity, auxiliary data].",
    );
  const items = Array.from({ length: 4 }, () =>
    Core.toHex(reader.readEncodedValue()),
  );
  reader.readEndArray();
  if (reader.getBytesRemaining())
    throw new Error("Unexpected data after the transaction.");
  return items;
}
function entries(cbor: string): Map<number, string> {
  const reader = new Core.CborReader(Core.HexBlob(cbor));
  reader.readStartMap();
  const result = new Map<number, string>();
  while (reader.peekState() !== Core.CborReaderState.EndMap) {
    const key = Number(reader.readUInt());
    if (!Number.isSafeInteger(key) || result.has(key))
      throw new Error("Invalid or duplicate CBOR map key.");
    result.set(key, Core.toHex(reader.readEncodedValue()));
  }
  reader.readEndMap();
  if (reader.getBytesRemaining())
    throw new Error("Unexpected data after CBOR map.");
  return result;
}
function readTransactionForEra(input: string, selectedEra?: Era) {
  if (input.length > MAX_HEX + 4096)
    throw new Error("Transaction file is too large (maximum 64 KiB of CBOR).");
  let value = input.trim(),
    era = selectedEra;
  if (value.startsWith("{")) {
    const envelope = JSON.parse(value);
    if (
      !envelope ||
      typeof envelope.cborHex !== "string" ||
      typeof envelope.type !== "string"
    )
      throw new Error("Expected a cardano-cli transaction JSON envelope.");
    const match =
      /^(?:Unwitnessed Tx|Witnessed Tx|Tx) (BabbageEra|ConwayEra)$/.exec(
        envelope.type,
      );
    if (!match)
      throw new Error("Import a Babbage or Conway transaction JSON envelope.");
    era = match[1] as Era;
    value = envelope.cborHex;
  }
  if (!era)
    throw new Error("Choose the transaction era before inspecting raw CBOR.");
  const cbor = hex(value),
    encoded = parts(cbor);
  // The SDK retains original body bytes; reject duplicate body/witness keys before decoding.
  const fields = entries(encoded[0]);
  if (
    [...fields.keys()].some(
      (key) =>
        ![
          0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 11, 13, 14, 15, 16, 17, 18, 19, 20, 21,
          22,
        ].includes(key),
    )
  )
    throw new Error("Transaction contains unsupported body fields.");
  if (era === "BabbageEra" && [...fields.keys()].some((key) => key >= 19))
    throw new Error("Transaction contains fields introduced after Babbage.");
  if (era === "ConwayEra" && [...fields.keys()].some((key) => key >= 23))
    throw new Error("Transaction contains fields introduced after Conway.");
  if (era === "ConwayEra" && fields.has(6))
    throw new Error("Legacy protocol updates are not supported in Conway.");
  const witnessFields = entries(encoded[1]);
  const maxWitnessKey = era === "BabbageEra" ? 6 : 7;
  if ([...witnessFields.keys()].some((key) => key > maxWitnessKey))
    throw new Error(
      `Transaction contains witness fields unsupported in ${era}.`,
    );
  if (era === "BabbageEra") {
    const sets = [
      ...[0, 4, 13, 14, 18].map((key) => fields.get(key)),
      ...[0, 1, 2, 3, 4, 6].map((key) => witnessFields.get(key)),
    ];
    if (
      sets.some(
        (value) =>
          value &&
          new Core.CborReader(Core.HexBlob(value)).peekState() ===
            Core.CborReaderState.Tag,
      )
    )
      throw new Error("Tagged transaction sets require Conway.");
    const redeemers = witnessFields.get(5);
    if (
      redeemers &&
      new Core.CborReader(Core.HexBlob(redeemers)).peekState() ===
        Core.CborReaderState.StartMap
    )
      throw new Error("Map-encoded redeemers require Conway.");
  }
  const tx = Core.Transaction.fromCbor(Core.TxCBOR(cbor));
  if (
    (tx.witnessSet().redeemers()?.values() ?? []).some(
      (redeemer) => redeemer.tag() > (era === "ConwayEra" ? 5 : 3),
    )
  )
    throw new Error(
      `Transaction contains redeemer purposes unsupported in ${era}.`,
    );
  for (const certificate of tx.body().certs()?.values() ?? []) {
    const kind = certificate.kind();
    const owners = certificate
      .asPoolRegistration()
      ?.poolParameters()
      .poolOwners();
    if (
      era === "BabbageEra" &&
      owners &&
      new Core.CborReader(owners.toCbor()).peekState() ===
        Core.CborReaderState.Tag
    )
      throw new Error("Tagged pool-owner sets require Conway.");
    if (era === "BabbageEra" && kind >= 7)
      throw new Error("Transaction contains Conway certificates.");
    if (era === "ConwayEra" && (kind === 5 || kind === 6))
      throw new Error(
        "Genesis delegation and MIR certificates are not supported in Conway.",
      );
  }
  const auxiliary = tx.auxiliaryData();
  if (
    auxiliary?.plutusV4Scripts()?.length ||
    (era === "BabbageEra" && auxiliary?.plutusV3Scripts()?.length)
  )
    throw new Error(
      `Transaction contains auxiliary scripts unsupported in ${era}.`,
    );
  const collateralReturn = tx.body().collateralReturn();
  const outputs = [
    ...tx.body().outputs(),
    ...(collateralReturn ? [collateralReturn] : []),
  ];
  const maxScriptLanguage = era === "BabbageEra" ? 2 : 3;
  if (
    outputs.some((output) => {
      const script = output.scriptRef();
      return script && script.language() > maxScriptLanguage;
    })
  )
    throw new Error(
      `Transaction contains reference scripts unsupported in ${era}.`,
    );
  if (tx.body().toCbor() !== encoded[0])
    throw new Error("Decoder did not preserve the transaction body.");
  return { cbor, tx, era, encoded, id: String(tx.getId()) };
}
export function readTransaction(input: string, selectedEra?: Era) {
  const envelope = input.trim().startsWith("{");
  if (envelope || selectedEra) {
    const transaction = readTransactionForEra(input, selectedEra);
    return {
      ...transaction,
      eraSource: envelope ? ("envelope" as const) : ("provided" as const),
      compatibleEras: [transaction.era],
    };
  }
  const compatible: ReturnType<typeof readTransactionForEra>[] = [];
  const errors: string[] = [];
  for (const era of ["ConwayEra", "BabbageEra"] as const) {
    try {
      compatible.push(readTransactionForEra(input, era));
    } catch (error) {
      errors.push(
        `${era.replace("Era", "")}: ${error instanceof Error ? error.message : "Invalid transaction"}`,
      );
    }
  }
  if (!compatible.length) throw new Error(errors.join(" "));
  // Shared-era bytes cannot prove their original era. Prefer the current testnet export format.
  return {
    ...compatible[0],
    eraSource:
      compatible.length > 1 ? ("compatible" as const) : ("features" as const),
    compatibleEras: compatible.map((transaction) => transaction.era),
  };
}
export type StudioTransaction = ReturnType<typeof readTransaction>;
export function transactionEnvelope(transaction: StudioTransaction) {
  return (
    JSON.stringify(
      {
        type: `Tx ${transaction.era}`,
        description: "Ledger Cddl Format",
        cborHex: transaction.cbor,
      },
      null,
      2,
    ) + "\n"
  );
}
function paymentAddress(value: string) {
  const address = Core.Address.fromBech32(value.trim());
  if (
    address.getNetworkId() !== 0 ||
    !(address.asBase() || address.asEnterprise() || address.asPointer())
  )
    throw new Error("Enter a testnet payment address.");
  return address;
}
export async function buildPayment(
  source: string,
  payments: { address: string; ada: string }[],
) {
  const address = paymentAddress(source),
    credential = address.getProps().paymentPart;
  if (credential?.type !== Core.CredentialType.KeyHash)
    throw new Error("Use a payment-key funding address.");
  if (!payments.length || payments.length > 20)
    throw new Error("Add between 1 and 20 recipients.");
  const intended = payments.map((p) => ({
    address: paymentAddress(p.address),
    coin: parseAdaToLovelace(p.ada),
  }));
  if (intended.some((p) => p.coin <= 0n))
    throw new Error("Each payment must be greater than zero.");
  const provider = getDingoProvider();
  await assertDingoNetwork(provider);
  const [outputs, tip, genesis] = await Promise.all([
    provider.getUnspentOutputs(address),
    blockfrostFetch<{ slot: number }>("/api/v0/blocks/latest"),
    blockfrostFetch<{ network_magic: number }>("/api/v0/genesis"),
  ]);
  if (genesis.network_magic !== DINGO_NETWORK.networkMagic)
    throw new Error(
      `Blockfrost API must serve ${DINGO_NETWORK.label} (network magic ${DINGO_NETWORK.networkMagic}).`,
    );
  if (!Number.isSafeInteger(tip.slot) || tip.slot < 0)
    throw new Error("Dingo returned an invalid tip slot.");
  const funds = outputs.filter(
    (u) =>
      !u.output().datum() &&
      !u.output().scriptRef() &&
      u.output().address().toBech32() === address.toBech32(),
  );
  if (!funds.length)
    throw new Error(
      "Dingo found no spendable payment-key UTxOs at this address.",
    );
  class FundingWallet extends ColdWallet {
    override async getUnspentOutputs() {
      return funds;
    }
  }
  // A cold wallet provides an address, never a private key or an extension signature.
  const blaze = await Blaze.from(
    provider,
    new FundingWallet(address, Core.NetworkId.Testnet, provider),
  );
  const builder = blaze
    .newTransaction()
    .addUnspentOutputs(funds)
    .setChangeAddress(address)
    .setValidUntil(Core.Slot(tip.slot + 3600));
  for (const p of intended) builder.payLovelace(p.address, p.coin);
  const tx = await builder.complete();
  intended.forEach((p, i) => {
    const actual = tx.body().outputs()[i];
    if (
      actual.address().toBech32() !== p.address.toBech32() ||
      actual.amount().coin() !== p.coin
    )
      throw new Error(
        `Payment amount is below minimum ${nativeTicker()} or changed during balancing.`,
      );
  });
  const available = new Map(
    funds.map((u) => [`${u.input().transactionId()}#${u.input().index()}`, u]),
  );
  if (available.size !== funds.length)
    throw new Error("Dingo returned duplicate UTxOs.");
  const selected = tx.body().inputs().values();
  const selectedIds = new Set<string>();
  let inputCoin = 0n,
    outputCoin = tx.body().fee();
  const assets = new Map<string, bigint>();
  const tally = (value: Core.Value, sign: bigint) => {
    for (const [id, amount] of value.multiasset() ?? [])
      assets.set(id, (assets.get(id) ?? 0n) + sign * amount);
  };
  for (const i of selected) {
    const id = `${i.transactionId()}#${i.index()}`,
      funding = available.get(id);
    if (!funding || selectedIds.has(id))
      throw new Error("Builder selected an unexpected or duplicate input.");
    selectedIds.add(id);
    inputCoin += funding.output().amount().coin();
    tally(funding.output().amount(), 1n);
  }
  for (const output of tx.body().outputs()) {
    outputCoin += output.amount().coin();
    tally(output.amount(), -1n);
  }
  if (
    inputCoin !== outputCoin ||
    [...assets.values()].some((amount) => amount !== 0n)
  )
    throw new Error("Transaction failed value conservation.");
  return readTransaction(tx.toCbor(), "ConwayEra");
}
export async function addWalletWitness(
  transaction: StudioTransaction,
  api: Cip30WalletApi,
  assertConnection: () => void,
) {
  const provider = getDingoProvider();
  assertConnection();
  if ((await api.getNetworkId()) !== 0)
    throw new Error("Connect a testnet wallet.");
  await assertDingoNetwork(provider);
  const body = transaction.tx.body();
  if (body.networkId() !== undefined && body.networkId() !== 0)
    throw new Error("This transaction is not for testnet.");
  const addresses = [
    ...body.outputs().map((o) => o.address()),
    ...(body.collateralReturn() ? [body.collateralReturn()!.address()] : []),
  ];
  if (
    addresses.some((a) => a.getNetworkId() !== 0) ||
    [...(body.withdrawals()?.keys() ?? [])].some(
      (a) => Core.Address.fromBech32(a).getNetworkId() !== 0,
    )
  )
    throw new Error("Transaction contains a non-testnet address.");
  const inputs = [
    ...body.inputs().values(),
    ...(body.collateral()?.values() ?? []),
    ...(body.referenceInputs()?.values() ?? []),
  ];
  const unique = [
    ...new Map(
      inputs.map((i) => [`${i.transactionId()}#${i.index()}`, i]),
    ).values(),
  ];
  const resolved = await provider.resolveUnspentOutputs(unique);
  const found = new Set(
    resolved.map((u) => `${u.input().transactionId()}#${u.input().index()}`),
  );
  if (
    !unique.length ||
    unique.some((i) => !found.has(`${i.transactionId()}#${i.index()}`)) ||
    resolved.some((u) => u.output().address().getNetworkId() !== 0)
  )
    throw new Error(
      `Dingo must resolve every input, collateral and reference input on ${DINGO_NETWORK.label} before signing.`,
    );
  assertConnection();
  const response = hex(await api.signTx(transaction.cbor, true));
  assertConnection();
  if ((await api.getNetworkId()) !== 0)
    throw new Error("Wallet network changed while signing.");
  assertConnection();
  await assertTransactionNetwork(transaction.tx, assertConnection, provider);
  const returned = entries(response),
    original = entries(transaction.encoded[1]);
  for (const [key, value] of returned)
    if (key !== 0 && original.get(key) !== value)
      throw new Error(
        "Wallet attempted to change a non-key witness. Transaction was preserved.",
      );
  const added =
    Core.TransactionWitnessSet.fromCbor(Core.HexBlob(response))
      .vkeys()
      ?.values() ?? [];
  if (!added.length)
    throw new Error("Wallet returned no payment or stake-key witnesses.");
  const existing = transaction.tx.witnessSet().vkeys()?.values() ?? [],
    merged = new Map(existing.map((w) => [w.vkey(), w]));
  for (const witness of added) {
    const key = Core.Ed25519PublicKey.fromHex(witness.vkey());
    if (
      !key.verify(
        Core.Ed25519Signature.fromHex(witness.signature()),
        Core.HexBlob(transaction.id),
      )
    )
      throw new Error("Wallet returned an invalid transaction signature.");
    const old = merged.get(witness.vkey());
    if (old && old.signature() !== witness.signature())
      throw new Error("Conflicting witness for an existing key.");
    merged.set(witness.vkey(), witness);
  }
  if (merged.size === existing.length)
    throw new Error("This wallet has already witnessed this transaction.");
  const keySet = new Core.CborWriter();
  if (transaction.era === "ConwayEra") keySet.writeTag(258);
  keySet.writeStartArray(merged.size);
  for (const witness of merged.values())
    keySet.writeEncodedValue(Core.fromHex(witness.toCbor()));
  original.set(0, keySet.encodeAsHex());
  const map = new Core.CborWriter().writeStartMap(original.size);
  // Preserve all script, datum and redeemer encodings: only the vkey entry changes.
  for (const [key, value] of original)
    map.writeInt(key).writeEncodedValue(Core.fromHex(value));
  const writer = new Core.CborWriter().writeStartArray(4);
  transaction.encoded.forEach((item, i) =>
    writer.writeEncodedValue(i === 1 ? map.encode() : Core.fromHex(item)),
  );
  const result = readTransaction(writer.encodeAsHex(), transaction.era);
  if (
    result.id !== transaction.id ||
    result.encoded[0] !== transaction.encoded[0] ||
    result.encoded[2] !== transaction.encoded[2] ||
    result.encoded[3] !== transaction.encoded[3]
  )
    throw new Error("Witness merge changed the original transaction.");
  return transaction.eraSource === "features" ||
    transaction.eraSource === "compatible"
    ? readTransaction(result.cbor)
    : { ...result, eraSource: transaction.eraSource };
}
