// @vitest-environment node
import { Blaze, ColdWallet, Core, Provider } from "@blaze-cardano/sdk";
import { makeUplcEvaluator } from "@blaze-cardano/vm";
import { beforeAll, expect, it, vi } from "vitest";
import { DingoProvider } from "../dingo/utxorpc/DingoProvider";
import { blockfrostFetch } from "../dingo/blockfrost";
import { phaseTwoParams } from "../kernel/phaseTwo.fixture";
import { decodeDanoPool, decodeDanoConfig, DANO_HASH } from "./data";
import { prepareDanoSwap, submitDanoSwap } from "./transactions";
import { getBlaze } from "../dingo/blaze";
import { readDanoPool, readDanoConfig } from "./read";
import type { Cip30WalletApi } from "../dingo/cip30";
vi.mock("../dingo/blaze", () => ({ getBlaze: vi.fn() }));
vi.mock("./read", () => ({ assertDanoMainnet: vi.fn(), readDanoPool: vi.fn(), readDanoConfig: vi.fn() }));
import pools from "./pools.fixture.json";
import configs from "./config.fixture.json";
import scripts from "./script.fixture.json";
vi.mock("../dingo/config", () => ({ DINGO_NETWORK: { id: "mainnet", label: "Mainnet", networkMagic: 764824073 }, DINGO_CONFIG: { blockfrostUrl: "http://localhost", utxorpcUrl: "http://localhost" } }));
vi.mock("../dingo/blockfrost", () => ({ blockfrostFetch: vi.fn() }));
beforeAll(() => Core.initCrypto());
const point = (input: Core.TransactionInput) => `${input.transactionId()}#${input.index()}`;
function rpc(row: { nativeBytes: string; txoRef: { hash: string; index?: number } }) { return new Core.TransactionUnspentOutput(new Core.TransactionInput(Core.TransactionId(Core.toHex(Uint8Array.from(atob(row.txoRef.hash), c => c.charCodeAt(0)))), BigInt(row.txoRef.index ?? 0)), Core.TransactionOutput.fromCbor(Core.HexBlob(Core.toHex(Uint8Array.from(atob(row.nativeBytes), c => c.charCodeAt(0)))))); }
class Ledger extends Provider {
  outputs = new Map<string, Core.TransactionUnspentOutput>();
  evaluations = 0;
  readonly params: Core.ProtocolParameters;
  constructor(params: Core.ProtocolParameters) {
    super(1, "cardano-mainnet");
    this.params = params;
  }
  async getParameters() {
    return this.params;
  }
  async getUnspentOutputs(address: Core.Address) {
    return [...this.outputs.values()].filter(
      (utxo) => utxo.output().address().toBytes() === address.toBytes(),
    );
  }
  async getUnspentOutputsWithAsset(address: Core.Address, asset: Core.AssetId) {
    return (await this.getUnspentOutputs(address)).filter(
      (utxo) => (utxo.output().amount().multiasset()?.get(asset) ?? 0n) > 0n,
    );
  }
  async getUnspentOutputByNFT(asset: Core.AssetId) {
    const outputs = [...this.outputs.values()].filter(
      (utxo) => utxo.output().amount().multiasset()?.get(asset) === 1n,
    );
    if (outputs.length !== 1) throw new Error("Fixture NFT not unique");
    return outputs[0];
  }
  async resolveUnspentOutputs(inputs: Core.TransactionInput[]) {
    return inputs.flatMap((input) => this.outputs.get(point(input)) ?? []);
  }
  async resolveDatum(): Promise<Core.PlutusData> {
    throw new Error("Fixture only uses inline datums");
  }
  async resolveScriptRef(script: Core.Script | Core.Hash28ByteBase16) {
    const hash = typeof script === "string" ? script : script.hash();
    return [...this.outputs.values()].find(
      (utxo) => utxo.output().scriptRef()?.hash() === hash,
    );
  }
  async awaitTransactionConfirmation(): Promise<boolean> {
    throw new Error("No live confirmation");
  }
  async postTransactionToChain(): Promise<Core.TransactionId> {
    throw new Error("No live submission");
  }
  async evaluateTransaction(
    tx: Core.Transaction,
    additional: Core.TransactionUnspentOutput[],
  ) {
    this.evaluations++;
    return makeUplcEvaluator(
      this.params,
      1,
      1,
      Core.SLOT_CONFIG_NETWORK.Mainnet,
    )(tx, [
      ...new Map(
        [...this.outputs.values(), ...additional].map((utxo) => [
          point(utxo.input()),
          utxo,
        ]),
      ).values(),
    ]);
  }
}

async function setup() {
 vi.restoreAllMocks(); vi.clearAllMocks();
 const clock = { slot: 202627200 };
 vi.mocked(blockfrostFetch).mockImplementation(async <T>(path: string) => {
   if (path === "/api/v0/epochs/latest/parameters") return phaseTwoParams as T;
   if (path === "/api/v0/blocks/latest") return { slot: clock.slot } as T;
   throw new Error(path);
 });
 const ledger = new Ledger(await new DingoProvider().getParameters());
 const reference = rpc(scripts.items[0]), config = decodeDanoConfig(rpc(configs.items[0]));
 const pool = pools.items.map(rpc).flatMap(u => {try {return [decodeDanoPool(u)];} catch {return [];}}).find(p => p.x !== "lovelace" && p.y !== "lovelace")!;
 expect(reference.output().scriptRef()?.hash()).toBe(DANO_HASH);
 for(const u of [reference,config.utxo,pool.utxo]) ledger.outputs.set(point(u.input()),u);
 const key = Core.Ed25519PrivateKey.fromNormalHex(Core.Ed25519PrivateNormalKeyHex("11".repeat(32)));
 const address = Core.addressFromCredential(1,Core.Credential.fromCore({type:Core.CredentialType.KeyHash,hash:key.toPublic().hash().hex()}));
 for(let i=0;i<3;i++){ const u=new Core.TransactionUnspentOutput(new Core.TransactionInput(Core.TransactionId("aa".repeat(32)),BigInt(i)),new Core.TransactionOutput(address,new Core.Value(100000000n,i===0?new Map([[Core.AssetId(pool.x),100000000n],[Core.AssetId(pool.y),100000000n]]):undefined)));ledger.outputs.set(point(u.input()),u); }
 const blaze=await Blaze.from(ledger,new ColdWallet(address,1,ledger));
 const api = { getNetworkId: vi.fn(async () => 1), getChangeAddress: async () => address.toBytes(), getUtxos: async () => (await ledger.getUnspentOutputs(address)).map(u=>u.toCbor()), getCollateral: async () => (await ledger.getUnspentOutputs(address)).filter(u=>!u.output().amount().multiasset()?.size).map(u=>u.toCbor()) } as unknown as Cip30WalletApi;
 vi.mocked(getBlaze).mockResolvedValue({ blaze } as unknown as Awaited<ReturnType<typeof getBlaze>>);
 vi.mocked(readDanoPool).mockImplementation(async()=>decodeDanoPool(ledger.outputs.get(point(pool.utxo.input()))!));
 vi.mocked(readDanoConfig).mockResolvedValue(config);
 const args = { poolName: pool.name, poolOutpoint: point(pool.utxo.input()), configOutpoint: point(config.utxo.input()), aToB: true, amount: 1000000n, minimum: 996n };
 return { ledger, pool, reference, config, blaze, key, address, api, clock, args };
}
it("evaluates both native-token directions against Dano's deployed mainnet validator", async () => {
 const f = await setup(), draft = await prepareDanoSwap(f.api,f.args,()=>{});
 expect(f.ledger.evaluations).toBeGreaterThan(0); expect(draft.quote.received).toBe(996n);
 expect(draft.tx.body().outputs()[0].amount().multiasset()?.get(Core.AssetId(f.pool.y))).toBe(145266232n);
 const next = new Core.TransactionUnspentOutput(new Core.TransactionInput(draft.tx.getId(),0n),draft.tx.body().outputs()[0]);
 f.ledger.outputs.delete(point(f.pool.utxo.input())); f.ledger.outputs.set(point(next.input()),next);
 vi.mocked(readDanoPool).mockResolvedValue(decodeDanoPool(next));
 const reversed = await prepareDanoSwap(f.api,{...f.args,poolOutpoint:point(next.input()),aToB:false,amount:100n,minimum:1n},()=>{});
 expect(reversed.quote.received).toBeGreaterThan(0n);
});
it("rejects a stale minimum and changed pool identity before signing", async () => {
 const f=await setup();
 await expect(prepareDanoSwap(f.api,{...f.args,minimum:1000n},()=>{})).rejects.toThrow("below the reviewed amount");
 await expect(prepareDanoSwap(f.api,{...f.args,poolName:"wrong"},()=>{})).rejects.toThrow("pool identity");
});
it("rejects absent and invalid funding signatures", async () => {
 const f=await setup(), draft=await prepareDanoSwap(f.api,f.args,()=>{});
 vi.spyOn(f.blaze,"signTransaction").mockImplementation(async tx=>tx);
 await expect(submitDanoSwap(f.api,draft,()=>{})).rejects.toThrow("sign every");
 vi.spyOn(f.blaze,"signTransaction").mockImplementation(async tx=>{const w=Core.TransactionWitnessSet.fromCbor(tx.witnessSet().toCbor());w.setVkeys(Core.CborSet.fromCore([[f.key.toPublic().hex(),f.key.sign(Core.HexBlob("22".repeat(32))).hex()]],Core.VkeyWitness.fromCore));tx.setWitnessSet(w);return tx;});
 await expect(submitDanoSwap(f.api,draft,()=>{})).rejects.toThrow("sign every");
});
it.each(["expired","spent config","spent funding","network","body"])("rejects %s drafts before signing",async change=>{
 const f=await setup(), draft=await prepareDanoSwap(f.api,f.args,()=>{}), sign=vi.spyOn(f.blaze,"signTransaction");
 if(change==="expired")f.clock.slot=draft.validUntil;
 if(change==="spent config")f.ledger.outputs.delete(point(f.config.utxo.input()));
 if(change==="spent funding")f.ledger.outputs.delete(point(draft.tx.body().inputs().values().find(i=>i.transactionId()==="aa".repeat(32))!));
 if(change==="network")vi.mocked(f.api.getNetworkId).mockResolvedValue(0);
 if(change==="body")draft.tx = new Core.Transaction(Core.TransactionBody.fromCore({ ...draft.tx.body().toCore(), fee: draft.tx.body().fee()+1n }), draft.tx.witnessSet(), draft.tx.auxiliaryData());
 await expect(submitDanoSwap(f.api,draft,()=>{})).rejects.toThrow();expect(sign).not.toHaveBeenCalled();
});

it("requires a fresh review when configuration fees change", async () => {
 const f=await setup(); await expect(prepareDanoSwap(f.api,{...f.args,configOutpoint:"changed"},()=>{})).rejects.toThrow("configuration changed"); expect(f.ledger.evaluations).toBe(0);
});
it("verifies a real funding signature before handing the transaction to Dingo", async () => {
 const f=await setup(),draft=await prepareDanoSwap(f.api,f.args,()=>{});
 vi.spyOn(f.blaze,"signTransaction").mockImplementation(async tx=>{const w=Core.TransactionWitnessSet.fromCbor(tx.witnessSet().toCbor()); w.setVkeys(Core.CborSet.fromCore([[f.key.toPublic().hex(),f.key.sign(Core.HexBlob(tx.getId())).hex()]],Core.VkeyWitness.fromCore));tx.setWitnessSet(w);return tx;});
 const post=vi.spyOn(f.ledger,"postTransactionToChain").mockResolvedValue(draft.tx.getId());
 await expect(submitDanoSwap(f.api,draft,()=>{})).resolves.toBe(String(draft.tx.getId()));expect(post).toHaveBeenCalledTimes(1);
});
it.each(["body","auxiliary","validity","account","reference"])("rejects %s changes during approval",async change=>{
 const f=await setup(),draft=await prepareDanoSwap(f.api,f.args,()=>{}),post=vi.spyOn(f.ledger,"postTransactionToChain");
 vi.spyOn(f.blaze,"signTransaction").mockImplementation(async tx=>{
  if(change==="body")return new Core.Transaction(Core.TransactionBody.fromCore({...tx.body().toCore(),fee:tx.body().fee()+1n}),tx.witnessSet(),tx.auxiliaryData());
  if(change==="auxiliary")tx.setAuxiliaryData(Core.AuxiliaryData.fromCbor(Core.HexBlob("a1016161")));
  if(change==="validity")return Core.Transaction.fromCbor(Core.TxCBOR(`84${tx.body().toCbor()}${tx.witnessSet().toCbor()}f4${tx.auxiliaryData()?.toCbor()??"f6"}`));
  if(change==="account")vi.spyOn(f.api,"getChangeAddress").mockResolvedValue(Core.addressFromCredential(1,Core.Credential.fromCore({type:Core.CredentialType.KeyHash,hash:Core.Hash28ByteBase16("44".repeat(28))})).toBytes());
  if(change==="reference")f.ledger.outputs.delete(point(f.reference.input()));
  return tx;
 });
 await expect(submitDanoSwap(f.api,draft,()=>{})).rejects.toThrow();expect(post).not.toHaveBeenCalled();
});

it("keeps the validity interval inside one epoch",async()=>{
 const f=await setup(), boundary=4492800+(667-208)*432000;
 f.clock.slot=boundary-100;const draft=await prepareDanoSwap(f.api,f.args,()=>{});expect(draft.validUntil).toBe(boundary-1);
 f.clock.slot=boundary-1;await expect(prepareDanoSwap(f.api,f.args,()=>{})).rejects.toThrow("epoch is ending");
 f.clock.slot=boundary;const next=await prepareDanoSwap(f.api,f.args,()=>{});expect(next.validUntil).toBe(boundary+240);
});
