import { Core } from "@blaze-cardano/sdk";

export const GRAVITY_INDEXER_POLICY =
  "c47763a86a3c7640de2973c10a3455b03e0bcd9873eae6e0a334fb51";
export const GRAVITY_ADA_INDEXER_ASSET =
  GRAVITY_INDEXER_POLICY +
  "0e5751c026e543b2e8ab2eb06099daa1d1e5df47778f7787faab45cdf12fe3a8";
export const GRAVITY_PAGE_SIZE = 20;
export type GravityUtxo = {
  address: string;
  tx_hash: string;
  output_index: number;
  inline_datum: string | null;
  amount: { unit: string; quantity: string }[];
};
export type GravityPool = {
  id: string;
  address: string;
  poolAddress: string;
  poolHash: string;
  txHash: string;
  outputIndex: number;
  assetA: string;
  assetB: string;
  limitOrderHash: string;
  depositOrderHash: string;
  withdrawOrderHash: string;
  poolType: 0 | 1 | 2 | 3;
  observerHash?: string;
  genesisObserverHash?: string;
};
function constr(
  data: Core.PlutusData,
  alternative: bigint,
  min: number,
  max = min,
) {
  const c = data.asConstrPlutusData(),
    n = c?.getData().getLength();
  if (
    !c ||
    c.getAlternative() !== alternative ||
    n === undefined ||
    n < min ||
    n > max
  )
    throw new Error("Unsupported Gravity oracle datum.");
  return Array.from({ length: n }, (_, i) => c.getData().get(i));
}
function bytes(data: Core.PlutusData, length?: number) {
  const raw = data.asBoundedBytes();
  if (!raw || (length !== undefined && raw.length !== length))
    throw new Error("Invalid Gravity oracle bytes.");
  return Core.toHex(raw);
}
function asset(data: Core.PlutusData) {
  const [policy, name] = constr(data, 0n, 2),
    p = bytes(policy),
    n = bytes(name);
  if ((p && p.length !== 56) || (!p && n) || n.length > 64)
    throw new Error("Invalid Gravity asset identifier.");
  return p ? p + n : "lovelace";
}
export function gravityScriptHash(address: string) {
  const parsed = Core.Address.fromString(address),
    payment = parsed?.getProps().paymentPart;
  if (
    !parsed ||
    parsed.getNetworkId() !== 0 ||
    payment?.type !== Core.CredentialType.ScriptHash
  )
    throw new Error("Gravity pool must use a testnet script address.");
  return payment.hash;
}
export function decodeGravityOracle(row: GravityUtxo): GravityPool {
  const id = gravityScriptHash(row.address);
  if (
    !/^[a-f0-9]{64}$/.test(row.tx_hash) ||
    !Number.isSafeInteger(row.output_index) ||
    row.output_index < 0 ||
    !row.inline_datum ||
    !/^(?:[a-f0-9]{2})+$/i.test(row.inline_datum) ||
    row.inline_datum.length > 65536
  )
    throw new Error("Invalid Gravity oracle reference.");
  const token = row.amount.filter((a) => a.unit === id + "0001");
  if (token.length !== 1 || token[0].quantity !== "1")
    throw new Error("Gravity pool oracle NFT is absent.");
  const f = constr(
    Core.PlutusData.fromCbor(Core.HexBlob(row.inline_datum)),
    4n,
    7,
    9,
  );
  const poolHash = bytes(f[0], 28),
    stake = Core.Address.fromString(row.address)?.getProps().delegationPart;
  if (!stake)
    throw new Error("Gravity oracle is missing its protocol stake credential.");
  const poolAddress = Core.Cardano.BaseAddress.fromCredentials(
    0,
    {
      type: Core.CredentialType.ScriptHash,
      hash: Core.Hash28ByteBase16(poolHash),
    },
    stake,
  )
    .toAddress()
    .toBech32();
  const assetA = asset(f[2]),
    assetB = asset(f[3]),
    kind = f[6].asInteger();
  if (assetA === assetB || kind === undefined || kind < 0n || kind > 3n)
    throw new Error("Invalid Gravity pool pair or type.");
  if (
    [0n, 3n].includes(kind) !== (assetA === "lovelace") ||
    assetB === "lovelace"
  )
    throw new Error("Gravity pool type does not match its assets.");
  return {
    id,
    address: row.address,
    poolHash,
    poolAddress,
    txHash: row.tx_hash,
    outputIndex: row.output_index,
    assetA,
    assetB,
    limitOrderHash: bytes(f[1], 28),
    depositOrderHash: bytes(f[4], 28),
    withdrawOrderHash: bytes(f[5], 28),
    poolType: Number(kind) as 0 | 1 | 2 | 3,
    observerHash: f[7] ? bytes(f[7], 28) : undefined,
    genesisObserverHash: f[8] ? bytes(f[8], 28) : undefined,
  };
}
