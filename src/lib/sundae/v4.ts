import { Blaze, Core, type Wallet } from "@blaze-cardano/sdk";
import { AssetAmount } from "@sundaeswap/asset";
import {
  DatumBuilderV4,
  EContractVersion,
  EPoolCurve,
  SundaeUtils,
  TxBuilderV4,
  type IPoolData,
  type ISundaeProtocolParamsFull,
  type ISundaeProtocolSetting,
} from "@sundaeswap/core";
import { blockfrostFetch } from "../dingo/blockfrost";
import {
  assertDingoNetwork,
  type DingoProvider,
} from "../dingo/utxorpc/provider";
import { metadataFor, unitFromAssetId } from "./assets";
import { DingoSundaeQueryProvider } from "./dingoQueryProvider";

// Canonical Preview deployment: SundaeSwap-finance/scooper-v2/config/preview-v4.json.
export const V4_DEPLOYMENT = {
  pool: "f577d24cfa393efdb85482554acbdd5082f99acba9c17eab916cf87a",
  order: "8a7ecdafb3605ddf761751b391c20482b7ef42ca01575d135d484c2b",
  settings: "43f2ee25b54dcd8150df9e9908ae890638844cd3a748ef05d8a09d09",
  settingsPolicy: "7b576da254d745bcbbabc91f34605deaa08f4e68d216f2a67d72ee12",
  poolPolicy: "b8a18e251b3e5078c04203f1a9af52408064c5d3a4256cfcfe3f67dd",
  basic: "4859acf5f46a50f383d16323a3c7eacf502ba732aa8874a7d3b7783e",
  fee: "d7d1c09deb8bc8e15baae7895e57e86ab6d0cb10e2faaa6d96cd691b",
  feeToken: "007e873372b3f5f3f8c6c70866acdf2644e7c9af64fa6aa4cff3ff094b417264",
  constantSum: "fa7f4860b25488fd63f2a7f5be4e8711520d288074b01286c9f14344",
  stableswap: "9db7ce54fb25f4390a89bb715a022fe79a86b9a043aa22c31c27380a",
} as const;
const REFERENCES = [
  [
    "order.spend",
    V4_DEPLOYMENT.order,
    "cfd46884fdf1b6b2a91feb6ad7252f950e5dad80ad83b2939954795c093925da",
  ],
  [
    "basic_order.withdraw",
    V4_DEPLOYMENT.basic,
    "d7b9325e631b6e2d486271462b478550f27920f1a672da4171c7eeed4228f868",
  ],
  [
    "fee_constraint.withdraw",
    V4_DEPLOYMENT.fee,
    "04a51c07ad31edf2e8af96aa18b69afd4dabcbbcd5eb8a00a95dd4a320a242e5",
  ],
] as const;
interface Output {
  address: string;
  tx_hash: string;
  output_index: number;
  amount: { unit: string; quantity: string }[];
  inline_datum: string | null;
}
function scriptAddress(hash: string) {
  return Core.addressFromCredential(
    0,
    Core.Credential.fromCore({
      hash: Core.Hash28ByteBase16(hash),
      type: Core.CredentialType.ScriptHash,
    }),
  ).toBech32();
}
function list(data: Core.PlutusData): Core.PlutusData[] {
  const value = data.asList();
  if (!value) throw new Error("Expected a V4 datum list.");
  return Array.from({ length: value.getLength() }, (_, i) => value.get(i));
}
function fields(data: Core.PlutusData, count?: number): Core.PlutusData[] {
  const value = data.asConstrPlutusData();
  if (!value || value.getAlternative() !== 0n)
    throw new Error("Unexpected V4 datum constructor.");
  const items = value.getData();
  if (count !== undefined && items.getLength() !== count)
    throw new Error("Unsupported V4 datum layout.");
  return Array.from({ length: items.getLength() }, (_, i) => items.get(i));
}
function bytes(data: Core.PlutusData) {
  const value = data.asBoundedBytes();
  if (!value) throw new Error("Expected a V4 datum byte string.");
  return Core.toHex(value);
}
function integer(data: Core.PlutusData) {
  const value = data.asInteger();
  if (value === undefined || value < 0n)
    throw new Error("Expected a nonnegative V4 datum integer.");
  return value;
}
function plutus(cbor: string) {
  if (!/^(?:[0-9a-f]{2})+$/i.test(cbor) || cbor.length > 131072)
    throw new Error("Invalid V4 datum CBOR.");
  return Core.PlutusData.fromCbor(Core.HexBlob(cbor));
}
async function addressOutputs(hash: string, signal?: AbortSignal) {
  const result: Output[] = [];
  for (let page = 1; page <= 4; page++) {
    const rows = await blockfrostFetch<Output[]>(
      `/api/v0/addresses/${scriptAddress(hash)}/utxos?count=100&page=${page}`,
      { signal },
    );
    if (!Array.isArray(rows))
      throw new Error("Dingo returned invalid V4 UTxOs.");
    result.push(...rows);
    if (rows.length < 100) return result;
  }
  throw new Error(
    "V4 address exceeds the bounded 400-output discovery window.",
  );
}
export interface V4Pool {
  ident: string;
  output: Output;
  assets: IPoolData["assetA"][];
  reserves: bigint[];
  curveHash: string;
  curveLabel: string;
  configHashes: Map<string, string>;
  lp: bigint;
}
function decodePool(output: Output): V4Pool | undefined {
  if (
    !output.inline_datum ||
    !output.amount.some(
      (a) =>
        a.unit.startsWith(V4_DEPLOYMENT.poolPolicy + "000de140") &&
        a.unit.length === 120 &&
        a.quantity === "1",
    )
  )
    return;
  const body = fields(plutus(output.inline_datum), 9);
  const ident = bytes(body[4]);
  if (!/^[0-9a-f]{56}$/.test(ident))
    throw new Error("Invalid V4 pool identifier.");
  const nft = V4_DEPLOYMENT.poolPolicy + DatumBuilderV4.cip68Names(ident).nft;
  if (!output.amount.some((a) => a.unit === nft && a.quantity === "1")) return;
  const balances = list(body[0]).map((item) => {
    const pair = list(item),
      asset = fields(pair[0], 2);
    if (pair.length !== 2) throw new Error("Invalid V4 asset balance.");
    const policy = bytes(asset[0]),
      name = bytes(asset[1]);
    if ((policy !== "" && !/^[0-9a-f]{56}$/.test(policy)) || name.length > 64)
      throw new Error("Invalid V4 asset class.");
    const id = policy ? `${policy}.${name}` : "ada.lovelace";
    if (!policy && name) throw new Error("Invalid V4 ADA asset.");
    const quantity = integer(pair[1]);
    const held = output.amount.find(
      (a) => a.unit === unitFromAssetId(id),
    )?.quantity;
    if (
      !held ||
      !/^\d+$/.test(held) ||
      BigInt(held) < quantity + (policy ? 0n : integer(body[7]))
    )
      throw new Error("V4 reserves exceed the pool output value.");
    return { asset: metadataFor(id, { decimals: policy ? 0 : 6 }), quantity };
  });
  if (
    balances.length < 2 ||
    new Set(balances.map((b) => b.asset.assetId)).size !== balances.length
  )
    throw new Error("Invalid V4 pool asset set.");
  const trade = list(body[5])
    .map((a) => fields(a, 3))
    .find((a) => integer(a[0]) === 100n);
  const enabled = trade?.[1].asConstrPlutusData()?.getAlternative() === 1n;
  const curveHash = enabled ? bytes(list(trade![2])[0]) : "";
  const configHashes = new Map(
    list(body[6]).map((item) => {
      const pair = list(item);
      if (pair.length !== 2) throw new Error("Invalid V4 module state.");
      return [bytes(pair[0]), bytes(pair[1])] as const;
    }),
  );
  return {
    ident,
    output,
    assets: balances.map((b) => b.asset),
    reserves: balances.map((b) => b.quantity),
    curveHash,
    curveLabel:
      curveHash === V4_DEPLOYMENT.constantSum
        ? "Constant sum"
        : curveHash === V4_DEPLOYMENT.stableswap
          ? "Stableswap"
          : "Unidentified module",
    configHashes,
    lp: integer(body[2]),
  };
}
export async function discoverV4Pools(signal?: AbortSignal) {
  const outputs = await addressOutputs(V4_DEPLOYMENT.pool, signal);
  return outputs.flatMap((output) => {
    const pool = decodePool(output);
    return pool ? [pool] : [];
  });
}
function committedConfig(tx: Core.Transaction, hash: string): Core.PlutusData {
  if (!/^[0-9a-f]{64}$/.test(hash))
    throw new Error("V4 curve has no valid config commitment.");
  let seen = 0,
    found: Core.PlutusData | undefined;
  function walk(data: Core.PlutusData, depth: number) {
    if (++seen > 20000 || depth > 40)
      throw new Error("V4 configuration exceeds the decoding bound.");
    if (Core.blake2b_256(Core.HexBlob(data.toCbor())).toString() === hash)
      found = data;
    const items = data.asConstrPlutusData()?.getData() ?? data.asList();
    if (items)
      for (let i = 0; i < items.getLength(); i++) walk(items.get(i), depth + 1);
    const map = data.asMap();
    if (map) {
      const keys = map.getKeys();
      for (let i = 0; i < keys.getLength(); i++) {
        walk(keys.get(i), depth + 1);
        walk(map.get(keys.get(i))!, depth + 1);
      }
    }
  }
  for (const redeemer of tx.witnessSet().redeemers()?.values() ?? [])
    walk(redeemer.data(), 0);
  if (!found)
    throw new Error(
      "Dingo transaction does not contain the pool's committed curve configuration.",
    );
  return found;
}
export async function loadV4Pool(
  pool: V4Pool,
  signal?: AbortSignal,
): Promise<IPoolData> {
  if (pool.assets.length !== 2)
    throw new Error("This market view supports two-asset V4 pools.");
  const sum = pool.curveHash === V4_DEPLOYMENT.constantSum,
    stable = pool.curveHash === V4_DEPLOYMENT.stableswap;
  if (!sum && !stable)
    throw new Error(
      "This pool's curve module has not been identified for local quoting.",
    );
  const result = await blockfrostFetch<{ cbor: string }>(
    `/api/v0/txs/${pool.output.tx_hash}/cbor`,
    { signal },
  );
  if (!/^(?:[0-9a-f]{2})+$/i.test(result.cbor) || result.cbor.length > 262144)
    throw new Error("Invalid V4 pool transaction CBOR.");
  const tx = Core.Transaction.fromCbor(Core.TxCBOR(result.cbor));
  if (String(tx.getId()) !== pool.output.tx_hash)
    throw new Error("Dingo returned a different V4 pool transaction.");
  return poolDataFromTransaction(pool, tx);
}
function poolDataFromTransaction(
  pool: V4Pool,
  tx: Core.Transaction,
): IPoolData {
  const sum = pool.curveHash === V4_DEPLOYMENT.constantSum,
    stable = pool.curveHash === V4_DEPLOYMENT.stableswap;
  const config = fields(
    committedConfig(tx, pool.configHashes.get(pool.curveHash) ?? ""),
  );
  if ((config.length !== 4 && sum) || (config.length !== 6 && stable))
    throw new Error("Unsupported V4 curve configuration layout.");
  const fee = fields(config[1], 2),
    num = integer(fee[0]),
    den = integer(fee[1]);
  if (!den || num >= den || den > BigInt(Number.MAX_SAFE_INTEGER))
    throw new Error("Invalid V4 curve fee.");
  const coefficients = list(config[sum ? 0 : 2]).map(integer);
  if (coefficients.length !== 2 || coefficients.some((n) => n <= 0n))
    throw new Error("Invalid V4 curve asset coefficients.");
  return {
    ident: pool.ident,
    version: EContractVersion.V4,
    assetA: pool.assets[0],
    assetB: pool.assets[1],
    assetLP: {
      assetId: `${V4_DEPLOYMENT.poolPolicy}.${DatumBuilderV4.cip68Names(pool.ident).lp}`,
      decimals: 0,
    },
    currentFee: Number(num) / Number(den),
    liquidity: {
      aReserve: pool.reserves[0],
      bReserve: pool.reserves[1],
      lpTotal: pool.lp,
    },
    curve: sum ? EPoolCurve.ConstantSum : EPoolCurve.V4Stableswap,
    ...(sum
      ? { prices: coefficients as [bigint, bigint] }
      : {
          rates: coefficients as [bigint, bigint],
          linearAmplificationFactor: integer(config[0]),
        }),
  };
}
export interface V4Settings {
  entries: ISundaeProtocolSetting[];
  baseFee: bigint;
  configToken: string;
}
export async function loadV4Settings(
  signal?: AbortSignal,
): Promise<V4Settings> {
  const outputs = await addressOutputs(V4_DEPLOYMENT.settings, signal);
  const trusted = outputs.filter((o) =>
    o.amount.some(
      (a) =>
        a.unit.startsWith(V4_DEPLOYMENT.settingsPolicy) && a.quantity === "1",
    ),
  );
  if (
    trusted.filter((o) =>
      o.amount.some(
        (a) => a.unit === V4_DEPLOYMENT.settingsPolicy && a.quantity === "1",
      ),
    ).length !== 1
  )
    throw new Error("V4 root settings NFT is unavailable or ambiguous.");
  const fee = trusted.filter((o) =>
    o.amount.some(
      (a) =>
        a.unit === V4_DEPLOYMENT.settingsPolicy + V4_DEPLOYMENT.feeToken &&
        a.quantity === "1",
    ),
  );
  if (fee.length !== 1 || !fee[0].inline_datum)
    throw new Error("V4 fee settings are unavailable or ambiguous.");
  const baseFee = integer(fields(plutus(fee[0].inline_datum), 1)[0]);
  if (baseFee <= 0n) throw new Error("Invalid V4 base service fee.");
  const candidates = trusted.flatMap((o) => {
    if (!o.inline_datum) return [];
    const data = plutus(o.inline_datum),
      f = data.asConstrPlutusData()?.getData();
    if (
      !f ||
      f.getLength() !== 2 ||
      !f.get(0).asBoundedBytes() ||
      !f.get(1).asList()
    )
      return [];
    const required = list(f.get(1)).map(bytes);
    if (
      required.length !== 2 ||
      !required.includes(V4_DEPLOYMENT.basic) ||
      !required.includes(V4_DEPLOYMENT.fee)
    )
      return [];
    const token = bytes(f.get(0));
    if (
      !o.amount.some(
        (a) =>
          a.unit === V4_DEPLOYMENT.settingsPolicy + token && a.quantity === "1",
      )
    )
      throw new Error("V4 order config token does not match its datum.");
    return [
      {
        label: "basic-order",
        txIn: { hash: o.tx_hash, index: o.output_index },
        datum: o.inline_datum,
        values: { token },
      },
    ];
  });
  if (candidates.length !== 1)
    throw new Error(
      "V4 basic-order configuration is unavailable or ambiguous.",
    );
  return {
    entries: candidates,
    baseFee,
    configToken: candidates[0].values.token,
  };
}
class V4QueryProvider extends DingoSundaeQueryProvider {
  private deployment: ISundaeProtocolParamsFull;
  constructor(provider: DingoProvider, deployment: ISundaeProtocolParamsFull) {
    super(provider);
    this.deployment = deployment;
  }
  override async getProtocolParamsWithScripts(
    version: undefined,
  ): Promise<ISundaeProtocolParamsFull[]>;
  override async getProtocolParamsWithScripts(
    version: EContractVersion,
  ): Promise<ISundaeProtocolParamsFull>;
  override async getProtocolParamsWithScripts(
    version?: EContractVersion,
  ): Promise<ISundaeProtocolParamsFull | ISundaeProtocolParamsFull[]> {
    if (version !== undefined && version !== EContractVersion.V4)
      throw new Error("This builder only supports Sundae V4.");
    return version ? this.deployment : [this.deployment];
  }
  override async getProtocolSettings() {
    return this.deployment.settings;
  }
}
export async function buildV4Swap(
  blaze: Blaze<DingoProvider, Wallet>,
  snapshot: V4Pool,
  offeredIndex: number,
  amount: bigint,
  minimum: bigint,
  budget: bigint,
  assertConnection: () => void,
) {
  assertConnection();
  await assertDingoNetwork(blaze.provider);
  const [settings, pools, resolved] = await Promise.all([
    loadV4Settings(),
    discoverV4Pools(),
    blaze.provider.resolveUnspentOutputs(
      REFERENCES.map(
        ([, , hash]) => new Core.TransactionInput(Core.TransactionId(hash), 0n),
      ),
    ),
  ]);
  for (const [, hash, txHash] of REFERENCES) {
    const reference = resolved.find(
      (u) =>
        String(u.input().transactionId()) === txHash &&
        u.input().index() === 0n,
    );
    if (reference?.output().scriptRef()?.hash().toString() !== hash)
      throw new Error(
        "V4 reference script is missing or does not match its deployment hash.",
      );
  }
  const current = pools.find((p) => p.ident === snapshot.ident);
  if (!current) throw new Error("The selected V4 pool is no longer available.");
  const pool = await loadV4Pool(current);
  if (
    (offeredIndex !== 0 && offeredIndex !== 1) ||
    amount <= 0n ||
    minimum <= 0n ||
    budget < settings.baseFee
  )
    throw new Error("Invalid V4 amount, minimum output or service-fee cap.");
  if (
    current.assets.some(
      (asset, i) => asset.assetId !== snapshot.assets[i]?.assetId,
    )
  )
    throw new Error("V4 pool assets changed. Review a new quote.");
  const offered = new AssetAmount(amount, current.assets[offeredIndex]);
  if (SundaeUtils.getSwapOutput(pool, offered).output < minimum)
    throw new Error(
      "The V4 price moved beyond your minimum. Review a new quote.",
    );
  const protocol: ISundaeProtocolParamsFull = {
    version: EContractVersion.V4,
    blueprint: {
      validators: REFERENCES.map(([title, hash]) => ({
        title,
        hash,
        compiledCode: "",
      })),
    },
    references: REFERENCES.map(([key, , hash]) => ({
      key,
      txIn: { hash, index: 0 },
    })),
    settings: settings.entries,
  };
  const builder = new TxBuilderV4(
    blaze,
    new V4QueryProvider(blaze.provider, protocol),
  );
  const ownerAddress = (await blaze.wallet.getChangeAddress()).toBech32();
  const composed = await builder.swapIntent({
    ownerAddress,
    offered,
    minReceived: new AssetAmount(minimum, current.assets[1 - offeredIndex]),
    budget,
    maxPerExecution: budget,
    configToken: settings.configToken,
  });
  const built = await composed.build();
  assertConnection();
  return {
    cbor: built.cbor,
    fee: built.builtTx.body().fee(),
    deposit: composed.fees.deposit.amount,
    budget,
    async signAndSubmit() {
      assertConnection();
      const networkBeforeSigning = await blaze.wallet.getNetworkId();
      assertConnection();
      if (networkBeforeSigning !== Core.NetworkId.Testnet)
        throw new Error(
          "Connect a Preview wallet before signing this V4 intent.",
        );
      const signed = await built.sign();
      assertConnection();
      const networkAfterSigning = await blaze.wallet.getNetworkId();
      assertConnection();
      if (networkAfterSigning !== Core.NetworkId.Testnet)
        throw new Error(
          "Wallet network changed while signing. Review the V4 intent again on Preview.",
        );
      return String(
        await blaze.provider.postTransactionToChain(
          Core.Transaction.fromCbor(Core.TxCBOR(signed.cbor)),
        ),
      );
    },
  };
}

export function v4ReferencePrice(pool: IPoolData) {
  const price = SundaeUtils.getPrice(pool);
  return pool.assetA.assetId === "ada.lovelace" ? 1 / price : price;
}
export async function readWeeklyV4Prices(pool: V4Pool, signal?: AbortSignal) {
  const step = 6 * 60 * 60 * 1000,
    end = Math.floor(Date.now() / step) * step,
    start = end - 7 * 86400000;
  const nft =
    V4_DEPLOYMENT.poolPolicy + DatumBuilderV4.cip68Names(pool.ident).nft;
  const rows: { tx_hash: string; block_time: number }[] = [];
  for (let page = 1; page <= 5; page++) {
    const pageRows = await blockfrostFetch<typeof rows>(
      `/api/v0/assets/${nft}/transactions?count=100&order=desc&page=${page}`,
      { signal },
    );
    if (
      pageRows.some(
        (r) =>
          !Number.isSafeInteger(r.block_time) ||
          !/^[a-f0-9]{64}$/i.test(r.tx_hash),
      )
    )
      throw new Error("Dingo returned invalid V4 history.");
    rows.push(...pageRows);
    if (pageRows.length < 100 || pageRows.at(-1)!.block_time * 1000 <= start)
      break;
    if (page === 5)
      throw new Error("V4 history exceeds the bounded 500-transaction window.");
  }
  rows.sort((a, b) => b.block_time - a.block_time);
  const samples = [];
  for (let time = start; time <= end; time += step) {
    const row = rows.find((r) => r.block_time * 1000 <= time);
    if (row) samples.push({ time, hash: row.tx_hash });
  }
  const hashes = [...new Set(samples.map((s) => s.hash))],
    prices = new Map<string, number>();
  for (let i = 0; i < hashes.length; i += 4)
    await Promise.all(
      hashes.slice(i, i + 4).map(async (hash) => {
        const result = await blockfrostFetch<{ cbor: string }>(
          `/api/v0/txs/${hash}/cbor`,
          { signal },
        );
        if (
          !/^(?:[a-f0-9]{2})+$/i.test(result.cbor) ||
          result.cbor.length > 262144
        )
          throw new Error("Invalid historical V4 transaction.");
        const tx = Core.Transaction.fromCbor(Core.TxCBOR(result.cbor));
        if (String(tx.getId()) !== hash)
          throw new Error(
            "Dingo returned a different V4 historical transaction.",
          );
        const poolAddress = Core.Address.fromBech32(
          scriptAddress(V4_DEPLOYMENT.pool),
        ).toBytes();
        const outputs = tx
          .body()
          .outputs()
          .map((o, index) => ({ o, index }))
          .filter(({ o }) => o.address().toBytes() === poolAddress)
          .map(({ o, index }) => ({
            address: o.address().toBech32(),
            tx_hash: hash,
            output_index: index,
            inline_datum: o.datum()?.asInlineData()?.toCbor() ?? null,
            amount: [
              { unit: "lovelace", quantity: o.amount().coin().toString() },
              ...[...(o.amount().multiasset() ?? [])].map(
                ([unit, quantity]) => ({
                  unit: String(unit),
                  quantity: String(quantity),
                }),
              ),
            ],
          }));
        const output = outputs.find(
          (o) =>
            o.address === scriptAddress(V4_DEPLOYMENT.pool) &&
            o.amount.some((a) => a.unit === nft && a.quantity === "1"),
        );
        const historical = output && decodePool(output);
        if (
          !historical ||
          historical.assets.some(
            (a, i) => a.assetId !== pool.assets[i]?.assetId,
          ) ||
          historical.curveHash !== pool.curveHash
        )
          throw new Error("V4 historical pool layout changed.");
        const price = v4ReferencePrice(poolDataFromTransaction(historical, tx));
        if (!Number.isFinite(price) || price <= 0)
          throw new Error("Invalid V4 historical price.");
        prices.set(hash, price);
      }),
    );
  return samples.map((s) => ({ time: s.time, price: prices.get(s.hash)! }));
}
