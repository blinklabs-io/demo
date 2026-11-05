import { Core } from "@blaze-cardano/sdk";
import {
  PREPROD_MINSWAP_V2,
  POOL_ADA_BUFFER,
  MAX_LIQUIDITY,
} from "./constants";
export type PoolDatum = {
  assetA: string;
  assetB: string;
  totalLiquidity: bigint;
  reserveA: bigint;
  reserveB: bigint;
  feeA: bigint;
  feeB: bigint;
  feeSharing?: bigint;
  dynamicFee: boolean;
};
export type MinswapUtxo = {
  address: string;
  tx_hash: string;
  output_index: number;
  inline_datum: string | null;
  amount: { unit: string; quantity: string }[];
};
export type MinswapPool = PoolDatum & {
  id: string;
  lpAsset: string;
  address: string;
  txHash: string;
  outputIndex: number;
  datum: string;
};
export function fields(
  data: Core.PlutusData,
  alternative: bigint,
  length: number,
): Core.PlutusData[] {
  const c = data.asConstrPlutusData(),
    list = c?.getData();
  if (!c || c.getAlternative() !== alternative || list?.getLength() !== length)
    throw new Error("Unsupported Minswap datum structure.");
  return Array.from({ length }, (_, i) => list.get(i));
}
export function integer(data: Core.PlutusData): bigint {
  const n = data.asInteger();
  if (n === undefined || n < 0n)
    throw new Error("Invalid Minswap datum amount.");
  return n;
}
export function bytes(data: Core.PlutusData): string {
  const value = data.asBoundedBytes();
  if (value === undefined) throw new Error("Invalid Minswap datum bytes.");
  return Core.toHex(value);
}
export function datumAsset(data: Core.PlutusData): string {
  const [policy, name] = fields(data, 0n, 2),
    p = bytes(policy),
    n = bytes(name);
  if ((!p && n) || (p && p.length !== 56) || n.length > 64)
    throw new Error("Invalid Minswap asset identifier.");
  return p ? p + n : "lovelace";
}
export function computeLpAsset(assetA: string, assetB: string): string {
  const a = assetA === "lovelace" ? "" : assetA,
    b = assetB === "lovelace" ? "" : assetB;
  const hash = Core.sha3_256(
    Core.HexBlob(
      Core.sha3_256(Core.HexBlob(a)) + Core.sha3_256(Core.HexBlob(b)),
    ),
  );
  return PREPROD_MINSWAP_V2.lpPolicyId + hash;
}
export function decodePoolDatum(cbor: string): PoolDatum {
  if (!/^(?:[0-9a-f]{2})+$/i.test(cbor) || cbor.length > 131072)
    throw new Error("Invalid Minswap datum CBOR.");
  const f = fields(Core.PlutusData.fromCbor(Core.HexBlob(cbor)), 0n, 10);
  const credential = fields(f[0], 0n, 1)[0].asConstrPlutusData();
  if (
    !credential ||
    ![0n, 1n].includes(credential.getAlternative()) ||
    credential.getData().getLength() !== 1 ||
    bytes(credential.getData().get(0)).length !== 56
  )
    throw new Error("Invalid Minswap batching credential.");
  const assetA = datumAsset(f[1]),
    assetB = datumAsset(f[2]);
  if (
    assetA === assetB ||
    (assetA !== "lovelace" && (assetB === "lovelace" || assetA >= assetB))
  )
    throw new Error("Minswap pool assets are not canonically ordered.");
  const feeA = integer(f[6]),
    feeB = integer(f[7]);
  if (feeA < 5n || feeA > 2000n || feeB < 5n || feeB > 2000n)
    throw new Error("Invalid Minswap trading fee.");
  const maybeFee = f[8].asConstrPlutusData(),
    dynamic = f[9].asConstrPlutusData();
  if (
    !maybeFee ||
    ![0n, 1n].includes(maybeFee.getAlternative()) ||
    !dynamic ||
    ![0n, 1n].includes(dynamic.getAlternative()) ||
    dynamic.getData().getLength() !== 0
  )
    throw new Error("Invalid Minswap fee settings.");
  const feeSharing =
    maybeFee.getAlternative() === 0n
      ? integer(fields(f[8], 0n, 1)[0])
      : (fields(f[8], 1n, 0), undefined);
  if (feeSharing !== undefined && feeSharing > 10000n)
    throw new Error("Invalid Minswap fee share.");
  const totalLiquidity = integer(f[3]);
  if (totalLiquidity > MAX_LIQUIDITY)
    throw new Error("Invalid Minswap liquidity supply.");
  return {
    assetA,
    assetB,
    totalLiquidity,
    reserveA: integer(f[4]),
    reserveB: integer(f[5]),
    feeA,
    feeB,
    feeSharing,
    dynamicFee: dynamic.getAlternative() === 1n,
  };
}
export function authenticatePool(row: MinswapUtxo): MinswapPool {
  const address = Core.Address.fromString(row.address);
  const payment = address?.getProps().paymentPart;
  if (
    !address ||
    address.getNetworkId() !== 0 ||
    payment?.type !== Core.CredentialType.ScriptHash ||
    payment.hash !== PREPROD_MINSWAP_V2.poolScriptHash
  )
    throw new Error("Unrecognized Minswap pool address.");
  if (
    !/^[0-9a-f]{64}$/i.test(row.tx_hash) ||
    !Number.isSafeInteger(row.output_index) ||
    row.output_index < 0 ||
    !row.inline_datum
  )
    throw new Error("Invalid Minswap pool reference or missing inline datum.");
  const amounts = new Map<string, bigint>();
  for (const amount of row.amount) {
    if (
      amounts.has(amount.unit) ||
      !/^\d+$/.test(amount.quantity) ||
      (amount.unit !== "lovelace" &&
        !/^[0-9a-f]{56}(?:[0-9a-f]{2}){0,32}$/.test(amount.unit))
    )
      throw new Error("Invalid Minswap UTxO value.");
    amounts.set(amount.unit, BigInt(amount.quantity));
  }
  if (amounts.get(PREPROD_MINSWAP_V2.poolAuthenAsset) !== 1n)
    throw new Error("Minswap pool authentication token is absent.");
  const datum = decodePoolDatum(row.inline_datum);
  for (const [asset, reserve] of [
    [datum.assetA, datum.reserveA],
    [datum.assetB, datum.reserveB],
  ] as const)
    if (
      (amounts.get(asset) ?? 0n) <
      reserve + (asset === "lovelace" ? POOL_ADA_BUFFER : 0n)
    )
      throw new Error("Minswap pool value does not back its datum reserves.");
  const lpAsset = computeLpAsset(datum.assetA, datum.assetB);
  return {
    ...datum,
    id: lpAsset,
    lpAsset,
    address: row.address,
    txHash: row.tx_hash,
    outputIndex: row.output_index,
    datum: row.inline_datum,
  };
}
