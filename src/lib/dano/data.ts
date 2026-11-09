import { Core } from "@blaze-cardano/sdk";
import { pd, assetUnit } from "../kernel/actions";

export const DANO_HASH = "d8b69fc53637bcfadbc4469083f706bc293f4d9d2296646c5ca167bb";
export const DANO_REFERENCE = "64d111b957e7d7848ffdde5149aa77fa4090a7fa1ad0ac108067900614848501#0";
export const DANO_CONFIG_NFT = "bc2d3b7cf1009c788b1daf2208a38026ab20d7f8209d896ad1a09c1472f9dae79bb2dfa39bd8fadf089ea0c8377b5eaa3caef0549396668aef1f9187";
export const DANO_CONFIG_HASH = "fa991bc2f9c4206e72d713bc3487a72e7901057cabb8d364bebeef8f";
export function danoFields(value: Core.PlutusData, count: number) {
  const con = value.asConstrPlutusData();
  if (!con || con.getAlternative() !== 0n || con.getData().getLength() !== count) throw new Error("Invalid Dano datum structure.");
  return Array.from({ length: count }, (_, i) => con.getData().get(i));
}
function integer(value: Core.PlutusData, positive = false) {
  const n = value.asInteger();
  if (n === undefined || n < (positive ? 1n : 0n) || n > 9223372036854775807n) throw new Error("Invalid Dano quantity.");
  return n;
}
function asset(value: Core.PlutusData) {
  const list = value.asList();
  if (!list || list.getLength() !== 2) throw new Error("Invalid Dano asset tuple.");
  const policy = list.get(0).asBoundedBytes(), name = list.get(1).asBoundedBytes();
  if (!policy || !name || name.length > 32 || (policy.length !== 28 && (policy.length !== 0 || name.length !== 0))) throw new Error("Invalid Dano asset identifier.");
  return assetUnit({ policyId: Core.toHex(policy), name: Core.toHex(name) }) || "lovelace";
}
export function decodeDanoConfig(utxo: Core.TransactionUnspentOutput) {
  const out = utxo.output(), key = out.address().getProps().paymentPart;
  if (out.address().getNetworkId() !== 1 || key?.type !== Core.CredentialType.ScriptHash || key.hash !== DANO_CONFIG_HASH || out.amount().multiasset()?.get(Core.AssetId(DANO_CONFIG_NFT)) !== 1n) throw new Error("Not the authenticated Dano configuration.");
  const datum = out.datum()?.asInlineData();
  if (!datum) throw new Error("Dano configuration has no inline datum.");
  const f = danoFields(datum, 2), platformFee = integer(f[0]), swapFee = integer(f[1]);
  if (platformFee > 10000n) throw new Error("Invalid Dano platform fee.");
  return { utxo, platformFee, swapFee };
}
export function decodeDanoPool(utxo: Core.TransactionUnspentOutput) {
  const out = utxo.output(), address = out.address(), key = address.getProps().paymentPart;
  if (address.getNetworkId() !== 1 || key?.type !== Core.CredentialType.ScriptHash || key.hash !== DANO_HASH) throw new Error("Not a Dano mainnet pool.");
  const datum = out.datum()?.asInlineData();
  if (!datum) throw new Error("Dano pool has no inline datum.");
  const f = danoFields(datum, 12), x = asset(f[0]), y = asset(f[1]);
  const markers = [...(out.amount().multiasset() ?? [])].filter(([unit, q]) => unit.startsWith(DANO_HASH) && unit.length === 120 && q === 1n);
  if (markers.length !== 1 || x === y || x === markers[0][0] || y === markers[0][0]) throw new Error("Dano pool identifier is missing or ambiguous.");
  const [an, ad] = danoFields(f[6], 2).map(n => integer(n, true)), [bn, bd] = danoFields(f[7], 2).map(n => integer(n, true));
  const fee = integer(f[2]), platformX = integer(f[3]), platformY = integer(f[4]), swapFees = integer(f[5]);
  if (fee >= 10000n || an * bd >= bn * ad) throw new Error("Invalid Dano price bounds or fee.");
  const quantity = (unit: string) => unit === "lovelace" ? out.amount().coin() : out.amount().multiasset()?.get(Core.AssetId(unit)) ?? 0n;
  const reserveX = quantity(x) - platformX - (x === "lovelace" ? 3000000n + swapFees : 0n), reserveY = quantity(y) - platformY;
  if (reserveX < 0n || reserveY < 0n || reserveX + reserveY === 0n) throw new Error("Invalid Dano pool reserves.");
  return { utxo, datum, fields: f, name: String(markers[0][0]), x, y, an, ad, bn, bd, fee, platformX, platformY, swapFees, minX: integer(f[8], true), minY: integer(f[9], true), supply: integer(f[10], true), epoch: integer(f[11]), reserveX, reserveY };
}
export type DanoPool = ReturnType<typeof decodeDanoPool>;
export type DanoConfig = ReturnType<typeof decodeDanoConfig>;
function sqrt(n: bigint) {
  if (n < 0n) throw new Error("Invalid Dano liquidity.");
  if (n < 2n) return n;
  let a = n, b = (n + 1n) / 2n;
  while (b < a) { a = b; b = (b + n / b) / 2n; }
  return a;
}
const ceil = (n: bigint, d: bigint) => (n + d - 1n) / d;
export function quoteDano(pool: DanoPool, config: DanoConfig, xToY: boolean, amount: bigint) {
  if (pool.x === "lovelace" || pool.y === "lovelace") throw new Error("ADA pools require staking reward settlement. Select a native-token pool.");
  if (amount <= 0n || amount > 9223372036854775807n || amount < (xToY ? pool.minX : pool.minY)) throw new Error("Enter an amount above the pool's minimum trade.");
  const { reserveX: x, reserveY: y, an, ad, bn, bd } = pool;
  const diff = y * ad * bd - x * an * bn;
  const lnum = y * ad * bd + x * an * bn + sqrt(diff * diff + 4n * x * y * ad * ad * bn * bn);
  const lden = 2n * (bn * ad - bd * an);
  const vx = x + ceil(lnum * bd, lden * bn), vy = y + ceil(lnum * an, lden * ad);
  const vin = xToY ? vx : vy, vout = xToY ? vy : vx;
  const received = vout * amount * (10000n - pool.fee) / (vin * 10000n + amount * (10000n - pool.fee));
  const platform = (amount * pool.fee / 10000n) * config.platformFee / 10000n;
  if (received < (xToY ? pool.minY : pool.minX) || received > (xToY ? y : x) || received > 9223372036854775807n) throw new Error("The pool cannot fill this trade within its price range.");
  return { received, platform, swapFee: config.swapFee };
}
export function danoSwapOutput(pool: DanoPool, config: DanoConfig, xToY: boolean, amount: bigint, epoch: bigint) {
  const quote = quoteDano(pool, config, xToY, amount), f = [...pool.fields];
  f[3] = pd.int(pool.platformX + (xToY ? quote.platform : 0n));
  f[4] = pd.int(pool.platformY + (xToY ? 0n : quote.platform));
  f[5] = pd.int(pool.swapFees + config.swapFee); f[11] = pd.int(epoch);
  const value = Core.Value.fromCbor(pool.utxo.output().amount().toCbor()), assets = new Map(value.multiasset());
  const input = Core.AssetId(xToY ? pool.x : pool.y), output = Core.AssetId(xToY ? pool.y : pool.x);
  assets.set(input, (assets.get(input) ?? 0n) + amount); assets.set(output, (assets.get(output) ?? 0n) - quote.received);
  value.setMultiasset(new Map([...assets].filter(([,q]) => q !== 0n))); value.setCoin(value.coin() + config.swapFee);
  if (value.coin() > 9223372036854775807n || [...assets.values()].some(q => q < 0n || q > 9223372036854775807n)) throw new Error("Dano continuing value exceeds ledger bounds.");
  const continuing = new Core.TransactionOutput(pool.utxo.output().address(), value);
  continuing.setDatum(Core.Datum.newInlineData(pd.con(0, f)));
  return { output: continuing, quote };
}
export function danoRedeemer(firstIndex: number, poolIndex: number, delta: bigint) {
  if (![firstIndex, poolIndex].every(i => Number.isInteger(i) && i >= 0 && i <= 255) || delta === 0n || delta <= -(1n << 255n) || delta >= (1n << 255n)) throw new Error("Dano redeemer index or amount is out of bounds.");
  const bytes = (delta < 0n ? delta + (1n << 256n) : delta).toString(16).padStart(64, "0");
  return pd.bytes(firstIndex.toString(16).padStart(2,"0") + "03" + poolIndex.toString(16).padStart(2,"0") + "00" + bytes);
}
