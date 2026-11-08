import { CARDANO_NETWORK_ID } from "../dingo/networkIdentity";
import { Core } from "@blaze-cardano/sdk";
import { minswapDeployment, BATCHER_FEE } from "./constants";
import { bytes, datumAsset, fields, integer, type MinswapUtxo } from "./data";
import { assertMinswapGenesis } from "./read";
import { blockfrostFetch } from "../dingo/blockfrost";
export type MinswapAction =
  | {
      kind: "swap";
      direction: "a-to-b" | "b-to-a";
      amount: bigint;
      slippageBps: number;
    }
  | { kind: "deposit"; amountA: bigint; amountB: bigint; slippageBps: number }
  | { kind: "withdraw"; lpAmount: bigint; slippageBps: number };
export function constr(tag: number, values: Core.PlutusData[] = []) {
  const list = new Core.PlutusList();
  for (const value of values) list.add(value);
  return Core.PlutusData.newConstrPlutusData(
    new Core.ConstrPlutusData(BigInt(tag), list),
  );
}
const rawBytes = (value: string) =>
  Core.PlutusData.newBytes(Core.fromHex(value));
const num = (value: bigint) => Core.PlutusData.newInteger(value);
function asset(unit: string) {
  return constr(0, [
    rawBytes(unit === "lovelace" ? "" : unit.slice(0, 56)),
    rawBytes(unit === "lovelace" ? "" : unit.slice(56)),
  ]);
}
function credential(value: Core.CredentialCore) {
  return constr(value.type, [rawBytes(value.hash)]);
}
function receiver(address: Core.Address) {
  const payment = address.getProps().paymentPart;
  if (!payment || (!address.asBase() && !address.asEnterprise()))
    throw new Error("Minswap requires a base or enterprise payment address.");
  const stake = address.getProps().delegationPart;
  return constr(0, [
    credential(payment),
    stake ? constr(0, [constr(0, [credential(stake)])]) : constr(1),
  ]);
}
export function orderAddress(sender: Core.Address): Core.Address {
  const stake = sender.getProps().delegationPart;
  if (!stake)
    return Core.Address.fromBech32(minswapDeployment().orderEnterpriseAddress);
  return Core.Cardano.BaseAddress.fromCredentials(
    CARDANO_NETWORK_ID,
    {
      type: Core.CredentialType.ScriptHash,
      hash: Core.Hash28ByteBase16(minswapDeployment().orderScriptHash),
    },
    stake,
  ).toAddress();
}
export function orderDatum(
  sender: Core.Address,
  lpAsset: string,
  action: MinswapAction,
  minimum: { minimum?: bigint; minimumA?: bigint; minimumB?: bigint },
) {
  const payment = sender.getProps().paymentPart;
  if (
    sender.getNetworkId() !== CARDANO_NETWORK_ID ||
    payment?.type !== Core.CredentialType.KeyHash
  )
    throw new Error("Minswap orders require a payment signing key on the selected network.");
  let step: Core.PlutusData;
  const kill = constr(0);
  if (action.kind === "swap")
    step = constr(0, [
      constr(action.direction === "a-to-b" ? 1 : 0),
      constr(0, [num(action.amount)]),
      num(minimum.minimum!),
      kill,
    ]);
  else if (action.kind === "deposit")
    step = constr(4, [
      constr(0, [num(action.amountA), num(action.amountB)]),
      num(minimum.minimum!),
      kill,
    ]);
  else
    step = constr(5, [
      constr(0, [num(action.lpAmount)]),
      num(minimum.minimumA!),
      num(minimum.minimumB!),
      kill,
    ]);
  return constr(0, [
    constr(0, [rawBytes(payment.hash)]),
    receiver(sender),
    constr(0),
    receiver(sender),
    constr(0),
    asset(lpAsset),
    step,
    num(BATCHER_FEE),
    constr(1),
  ]);
}
export type MinswapOrder = {
  address: string;
  txHash: string;
  outputIndex: number;
  datum: string;
  amount: MinswapUtxo["amount"];
  canceller: string;
  lpAsset: string;
  kind: string;
  maxBatcherFee: bigint;
};
export function decodeOrder(row: MinswapUtxo): MinswapOrder {
  const address = Core.Address.fromString(row.address),
    payment = address?.getProps().paymentPart;
  if (
    !address ||
    address.getNetworkId() !== CARDANO_NETWORK_ID ||
    payment?.type !== Core.CredentialType.ScriptHash ||
    payment.hash !== minswapDeployment().orderScriptHash ||
    !row.inline_datum
  )
    throw new Error("Not an inline Minswap V2 order.");
  if (
    !/^[0-9a-f]{64}$/i.test(row.tx_hash) ||
    !Number.isSafeInteger(row.output_index) ||
    row.output_index < 0 ||
    row.inline_datum.length > 131072
  )
    throw new Error("Invalid Minswap order reference.");
  const f = fields(
    Core.PlutusData.fromCbor(Core.HexBlob(row.inline_datum)),
    0n,
    9,
  );
  const canceller = bytes(fields(f[0], 0n, 1)[0]);
  if (canceller.length !== 56) throw new Error("Invalid Minswap order owner.");
  const lpAsset = datumAsset(f[5]),
    step = f[6].asConstrPlutusData()?.getAlternative();
  if (
    !lpAsset.startsWith(minswapDeployment().lpPolicyId) ||
    lpAsset.length !== 120 ||
    step === undefined
  )
    throw new Error("Invalid Minswap order pool.");
  return {
    address: row.address,
    txHash: row.tx_hash,
    outputIndex: row.output_index,
    datum: row.inline_datum,
    amount: row.amount,
    canceller,
    lpAsset,
    kind:
      step === 0n
        ? "swap"
        : step === 4n
          ? "deposit"
          : step === 5n
            ? "withdraw"
            : `order-${step}`,
    maxBatcherFee: integer(f[7]),
  };
}
export function minswapOrderAccount(senders: readonly string[]) {
  const keys = new Set<string>(),
    addresses = new Set<string>();
  for (const value of senders) {
    const sender = Core.Address.fromBech32(value),
      key = sender.getProps().paymentPart;
    if (
      sender.getNetworkId() !== CARDANO_NETWORK_ID ||
      (!sender.asBase() && !sender.asEnterprise()) ||
      key?.type !== Core.CredentialType.KeyHash
    )
      throw new Error(
        "A payment address on the selected network is required to find cancellable orders.",
      );
    keys.add(String(key.hash));
    addresses.add(orderAddress(sender).toBech32());
  }
  return { keys, addresses: [...addresses] };
}
export async function readMinswapOrders(
  senders: readonly string[],
  page = 1,
  signal?: AbortSignal,
) {
  if (!Number.isSafeInteger(page) || page < 1)
    throw new Error("Choose a valid Minswap order page.");
  const { keys, addresses } = minswapOrderAccount(senders);
  if (addresses.length > 20)
    throw new Error(
      "Order discovery supports at most 20 distinct staking addresses per page.",
    );
  if (!addresses.length) return { orders: [], partial: false, errors: [] };
  await assertMinswapGenesis(signal);
  const orders: MinswapOrder[] = [],
    errors: string[] = [],
    seen = new Set<string>();
  let partial = false;
  for (let offset = 0; offset < addresses.length; offset += 4) {
    const pages = await Promise.all(
      addresses.slice(offset, offset + 4).map(async (address) => ({
        address,
        rows: await blockfrostFetch<MinswapUtxo[]>(
          `/api/v0/addresses/${address}/utxos?count=20&page=${page}`,
          { signal },
        ),
      })),
    );
    for (const { address, rows } of pages) {
      signal?.throwIfAborted();
      if (rows.length > 20)
        throw new Error(
          "Dingo exceeded the requested Minswap order page size.",
        );
      partial ||= rows.length === 20;
      for (const row of rows)
        try {
          if (row.address !== address)
            throw new Error("Dingo returned an order from another address.");
          const order = decodeOrder(row),
            outpoint = order.txHash + "#" + order.outputIndex;
          if (seen.has(outpoint))
            throw new Error("Dingo repeated a Minswap order output.");
          seen.add(outpoint);
          if (keys.has(order.canceller)) orders.push(order);
        } catch (error) {
          errors.push(
            error instanceof Error ? error.message : "Unsupported order",
          );
        }
    }
  }
  return { orders, partial, errors };
}
