// @vitest-environment node
import { Core } from "@blaze-cardano/sdk";
import { beforeAll, beforeEach, expect, it, vi } from "vitest";
import { readMinswapPools, readMinswapPool, readPopularMinswapPools, readPopularMinswapPool } from "./read";
import { readMinswapAssetPage } from "./rpc";
import { blockfrostFetch } from "../dingo/blockfrost";
import { orderAddress, orderDatum } from "./orders";
import { minswapDeployment } from "./constants";
const mocks = vi.hoisted(() => ({ search: vi.fn(), genesis: vi.fn() }));
vi.mock("../dingo/config", () => ({ DINGO_NETWORK: { id: "mainnet", label: "Mainnet", networkMagic: 764824073 }, DINGO_CONFIG: {} }));
vi.mock("../dingo/blockfrost", () => ({ blockfrostFetch: vi.fn() }));
vi.mock("../dingo/utxorpc/provider", async (original) => ({ ...await original<typeof import("../dingo/utxorpc/provider")>(), getDingoProvider: () => ({ queryClient: { readGenesis: mocks.genesis, inner: { searchUtxos: mocks.search } } }) }));
const native = ["owBYORHqB7cz2TISnDeK9idDbny8LvC/luADa7UbO95rUlY8VBC/9qDUPM67fDfh9p9esmBVJSGt/zO5wgGCGgBEqiGiWBzMmGWeaIAfKCd3m727la9a6sz9zICwHlXFuS98oUZDSEFMSUUaO5rKAFgc9YCMLJkNhtpUv8l9ic7m76IM2EYWFjWUeNlrTKJDTVNQAVgg2cH312CDEHdE4/IzatoXx0vtJMi7UKLu+nRyJ5YFYcUbf/////////8CggHYGFhu2Hmf2Hmf2HqfWBwerpa68p4naC6j+BWro2GgxgWdReS/vpW70vRK///YeZ9AQP/YeZ9YHMyYZZ5ogB8oJ3ebvbuVr1rqzP3MgLAeVcW5L3xGQ0hBTElF/woBGjuTKakYHhge2HmfGQaC/9h5gP8=", "owBYORHqB7cz2TISnDeK9idDbny8LvC/luADa7UbO95rUlY8VBC/9qDUPM67fDfh9p9esmBVJSGt/zO5wgGCGgBEqiGiWBy85+ISaCTjopybvZ3t3vImkQcQhH7qWdoXvH4RoUVTTlVNUBsAAAAMzkFmAFgc9YCMLJkNhtpUv8l9ic7m76IM2EYWFjWUeNlrTKJDTVNQAVgg70UwOY5T7qde49AqmC6HpcaAd2kEtdYQ5jv2lwxSihIbf/////////8CggHYGFhx2Hmf2Hmf2HqfWBwerpa68p4naC6j+BWro2GgxgWdReS/vpW70vRK///YeZ9AQP/YeZ9YHLzn4hJoJOOinJu9ne3e8iaRBxCEfupZ2he8fhFFU05VTVD/CgEbAAAADMjLPFEYZBhk2HmfGQaC/9h5gP8="];
const item = (index: number) => ({ parsedState: { case: "cardano" }, txoRef: { hash: new Uint8Array(32).fill(index + 1), index: 0 }, nativeBytes: Uint8Array.from(Buffer.from(native[index], "base64")) });
beforeAll(() => Core.initCrypto());
beforeEach(() => { vi.clearAllMocks(); mocks.genesis.mockResolvedValue({ networkMagic: 764824073 }); vi.mocked(blockfrostFetch).mockResolvedValue({ network_magic: 764824073 }); mocks.search.mockResolvedValue({ items: [item(0), item(1)], nextToken: "next-page" }); });
it("authenticates mainnet pools from asset-only RPC pages and preserves the opaque cursor", async () => {
  const result = await readMinswapPools();
  expect(result.errors).toEqual([]); expect(result.pools).toHaveLength(2); expect(result.partial).toBe(true); expect(result.nextToken).toBe("next-page");
  expect(result.pools.every((pool) => pool.address === minswapDeployment().poolCreationAddress)).toBe(true);
  mocks.search.mockResolvedValue({ items: [item(0)], nextToken: "third-page" });
  await readMinswapPools(2, undefined, result.nextToken);
  expect(mocks.search.mock.lastCall![0]).toMatchObject({ maxItems: 20, startToken: "next-page" });
  expect(mocks.search.mock.lastCall![0].predicate.match.utxoPattern.value.address).toBeUndefined();
  await expect(readMinswapPools(2)).rejects.toThrow("preceding Minswap pool page");
});
it("finds a mainnet LP state and routes its order to the mainnet contract", async () => {
  const pools = await readMinswapPools(); const pool = pools.pools[0];
  mocks.search.mockResolvedValue({ items: [item(0)], nextToken: "" });
  expect((await readMinswapPool(pool)).lpAsset).toBe(pool.lpAsset);
  const sender = Core.addressFromCredential(1, Core.Credential.fromCore({ type: Core.CredentialType.KeyHash, hash: Core.Ed25519KeyHashHex("11".repeat(28)) }));
  expect(orderAddress(sender).toBech32()).toBe(minswapDeployment().orderEnterpriseAddress);
  expect(orderDatum(sender, pool.lpAsset, { kind: "swap", direction: "a-to-b", amount: 10000000n, slippageBps: 50 }, { minimum: 1n }).toCbor()).toBeTruthy();
});
it("rejects wrong-chain, incomplete, unrelated, duplicate and repeating RPC pages", async () => {
  const asset = minswapDeployment().poolAuthenAsset;
  mocks.genesis.mockResolvedValue({ networkMagic: 1 }); await expect(readMinswapAssetPage(asset)).rejects.toThrow("requires Mainnet"); expect(mocks.search).not.toHaveBeenCalled();
  mocks.genesis.mockResolvedValue({ networkMagic: 764824073 });
  mocks.search.mockResolvedValue({ items: [{ ...item(0), nativeBytes: new Uint8Array() }], nextToken: "" }); await expect(readMinswapAssetPage(asset)).rejects.toThrow("incomplete Cardano");
  mocks.search.mockResolvedValue({ items: [item(0)], nextToken: "" }); await expect(readMinswapAssetPage("22".repeat(28) + "01")).rejects.toThrow("without the requested");
  mocks.search.mockResolvedValue({ items: [item(0), item(0)], nextToken: "" }); await expect(readMinswapAssetPage(asset)).rejects.toThrow("repeated");
  mocks.search.mockResolvedValue({ items: [item(0)], nextToken: "same" }); await expect(readMinswapAssetPage(asset, "same")).rejects.toThrow("repeated");
});

it("accepts canonical native CBOR without a parsed RPC projection and rejects oversized bytes", async () => {
  const { parsedState: _, ...nativeOnly } = item(0); void _;
  mocks.search.mockResolvedValue({ items: [nativeOnly], nextToken: "" });
  expect((await readMinswapPools()).pools).toHaveLength(1);
  mocks.search.mockResolvedValue({ items: [{ ...nativeOnly, nativeBytes: new Uint8Array(65537) }], nextToken: "" });
  await expect(readMinswapPools()).rejects.toThrow("incomplete Cardano");
});
it("scopes LP queries to the pool address so wallet-held tokens do not consume the lookup bound", async () => {
  const pool = (await readMinswapPools()).pools[0];
  mocks.search.mockImplementation(async (request) => {
    const address = request.predicate.match.utxoPattern.value.address?.paymentPart;
    return address ? { items: [item(0)], nextToken: "" } : { items: [], nextToken: request.startToken + "next" };
  });
  expect((await readMinswapPool(pool)).lpAsset).toBe(pool.lpAsset);
  expect(mocks.search.mock.lastCall![0].predicate.match.utxoPattern.value.address.paymentPart).toEqual(Core.fromHex(minswapDeployment().poolScriptHash));
});
it("carries LP cursors across pages, verifies genesis once and enforces the five-page bound", async () => {
  const pool = (await readMinswapPools()).pools[0];
  mocks.search.mockReset().mockResolvedValueOnce({ items: [], nextToken: "second" }).mockResolvedValueOnce({ items: [item(0)], nextToken: "" });
  const before = mocks.genesis.mock.calls.length;
  expect((await readMinswapPool(pool)).lpAsset).toBe(pool.lpAsset);
  expect(mocks.search.mock.lastCall![0].startToken).toBe("second");
  expect(mocks.genesis.mock.calls.length - before).toBe(1);
  mocks.search.mockReset().mockImplementation(async (request) => ({ items: [], nextToken: request.startToken + "next" }));
  await expect(readMinswapPool(pool)).rejects.toThrow("bounded 100-output scan");
  expect(mocks.search).toHaveBeenCalledTimes(5);
});

it("authenticates pool state with a changed staking credential", async () => {
  const output = Core.TransactionOutput.fromCbor(Core.HexBlob.fromBytes(item(0).nativeBytes));
  const address = Core.Cardano.BaseAddress.fromCredentials(1, { type: Core.CredentialType.ScriptHash, hash: Core.Hash28ByteBase16(minswapDeployment().poolScriptHash) }, { type: Core.CredentialType.KeyHash, hash: Core.Hash28ByteBase16("11".repeat(28)) }).toAddress();
  const moved = new Core.TransactionOutput(address, output.amount());
  moved.setDatum(output.datum()!);
  mocks.search.mockResolvedValue({ items: [{ ...item(0), nativeBytes: Core.fromHex(moved.toCbor()) }], nextToken: "" });
  const pool = (await readMinswapPools()).pools[0];
  expect(pool.address).toBe(address.toBech32());
  expect((await readMinswapPool(pool)).address).toBe(address.toBech32());
});

it("loads volume discovery without Dingo scans and authenticates only the selected market", async () => {
  const known = (await readMinswapPools()).pools;
  const metrics = known.map((p, i) => ({ lpAsset: p.lpAsset, assetA: p.assetA, assetB: p.assetB, volumeAda: 2 - i }));
  const fetch = vi.spyOn(globalThis, "fetch").mockResolvedValue(Response.json({ pools: metrics }));
  mocks.search.mockClear();
  try {
    const result = await readPopularMinswapPools();
    expect(result.pools).toEqual(metrics.map((metric) => ({ ...metric, id: metric.lpAsset })));
    expect(mocks.search).not.toHaveBeenCalled();
    mocks.search.mockResolvedValue({ items: [item(0)], nextToken: "" });
    expect((await readPopularMinswapPool(result.pools[0])).lpAsset).toBe(known[0].lpAsset);
    await expect(readPopularMinswapPool({ ...metrics[0], assetB: "ff".repeat(28) })).rejects.toThrow("asset pair");
  } finally { fetch.mockRestore(); }
});
