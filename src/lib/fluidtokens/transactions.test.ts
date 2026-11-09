// @vitest-environment node
import { blake2b } from "blakejs";
import borrowReferences from "./borrow-references.fixture.json";
import { Blaze, ColdWallet, Core, Provider } from "@blaze-cardano/sdk";
import { makeUplcEvaluator } from "@blaze-cardano/vm";
import { beforeAll, expect, it, vi } from "vitest";
import { getBlaze } from "../dingo/blaze";
import { blockfrostFetch } from "../dingo/blockfrost";
import { DingoProvider } from "../dingo/utxorpc/DingoProvider";
import { phaseTwoParams } from "../kernel/phaseTwo.fixture";
import type { Cip30WalletApi } from "../dingo/cip30";
import { pd } from "../kernel/actions";
import { fluidRpcOutput } from "./fixtures";
import { decodeFluidConfig, decodeFluidPool, fluidPoint, FLUID_POOL_POLICY, fluidFields, fluidRefData, type FluidTerms } from "./data";
import { readFluidPool, readFluidConfig } from "./read";
import { prepareFluidAction, submitFluidAction } from "./transactions";
import config from "./config.fixture.json";
import references from "./references.fixture.json";
vi.mock("../dingo/config",()=>({ DINGO_NETWORK:{id:"mainnet",label:"Mainnet",networkMagic:764824073},DINGO_CONFIG:{blockfrostUrl:"http://localhost",utxorpcUrl:"http://localhost"} }));
vi.mock("../dingo/blaze",()=>({getBlaze:vi.fn()}));
vi.mock("../dingo/blockfrost",()=>({blockfrostFetch:vi.fn()}));
vi.mock("./read",async importOriginal=>({...await importOriginal<typeof import("./read")>(),assertFluidMainnet:vi.fn(),readFluidConfig:vi.fn(),readFluidPool:vi.fn()}));
beforeAll(()=>Core.initCrypto());
const point=(input:Core.TransactionInput)=>`${input.transactionId()}#${input.index()}`;
const token="33".repeat(28)+"01";
const terms:FluidTerms={principal:"lovelace",collateral:token,amount:100000000n,collateralAmount:1000000n,principalRatio:1000000n,interest:1000n,hours:720,repaymentWindow:24,extraAda:0n};
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
 vi.restoreAllMocks();vi.clearAllMocks();const clock={slot:202627200};
 vi.mocked(blockfrostFetch).mockImplementation(async <T>(path:string)=>{if(path==="/api/v0/epochs/latest/parameters")return phaseTwoParams as T;if(path==="/api/v0/blocks/latest")return {slot:clock.slot} as T;throw new Error(path);});
 const ledger=new Ledger(await new DingoProvider().getParameters());
 const configuration=decodeFluidConfig(fluidRpcOutput(config.items[0]));
 for(const u of [configuration.utxo,...references.items.map(fluidRpcOutput)])ledger.outputs.set(point(u.input()),u);
 const key=Core.Ed25519PrivateKey.fromNormalHex(Core.Ed25519PrivateNormalKeyHex("11".repeat(32))),address=Core.addressFromCredentials(1,Core.Credential.fromCore({type:Core.CredentialType.KeyHash,hash:key.toPublic().hash().hex()}),Core.Credential.fromCore({type:Core.CredentialType.KeyHash,hash:Core.Hash28ByteBase16("22".repeat(28))}));
 for(let i=0;i<3;i++){const u=new Core.TransactionUnspentOutput(new Core.TransactionInput(Core.TransactionId("aa".repeat(32)),BigInt(i)),new Core.TransactionOutput(address,new Core.Value(i===0?1000000000n:50000000n,i===0?new Map([[Core.AssetId(token),1000000000n]]):undefined)));ledger.outputs.set(point(u.input()),u);}
 const api={getNetworkId:vi.fn(async()=>1),getChangeAddress:async()=>address.toBytes(),getUsedAddresses:async()=>[address.toBytes()],getUnusedAddresses:async()=>[]}as unknown as Cip30WalletApi;
 const blaze=await Blaze.from(ledger,new ColdWallet(address,1,ledger));vi.mocked(getBlaze).mockResolvedValue({blaze}as unknown as Awaited<ReturnType<typeof getBlaze>>);vi.mocked(readFluidConfig).mockResolvedValue(configuration);
 vi.mocked(readFluidPool).mockImplementation(async ref=>decodeFluidPool(ledger.outputs.get(ref)!));
 return {ledger,key,address,api,blaze,configuration,clock};
}
it.each([true,false])("creates and cancels a pool using deployed validators with ADA principal=%s",async ada=>{
 const f=await setup(),chosen=ada?terms:{...terms,principal:token,collateral:"lovelace",extraAda:3000000n};
 const draft=await prepareFluidAction(f.api,{kind:"create",terms:chosen},()=>{});
 expect(f.ledger.evaluations).toBeGreaterThan(0);expect(draft.tx.body().mint()?.get(Core.AssetId(FLUID_POOL_POLICY+draft.name))).toBe(1n);
 const utxo=new Core.TransactionUnspentOutput(new Core.TransactionInput(draft.tx.getId(),0n),draft.output);f.ledger.outputs.set(point(utxo.input()),utxo);
 const pool=decodeFluidPool(utxo);expect(pool.available).toBe(chosen.amount);expect(pool.key).toBe(String(f.address.getProps().paymentPart!.hash));
 const cancelled=await prepareFluidAction(f.api,{kind:"cancel",outpoint:fluidPoint(pool)},()=>{});
 expect(cancelled.tx.body().mint()?.get(Core.AssetId(FLUID_POOL_POLICY+draft.name))).toBe(-1n);expect(cancelled.output.address().toBytes()).toBe(f.address.toBytes());expect(cancelled.output.amount().multiasset()?.get(Core.AssetId(FLUID_POOL_POLICY+draft.name)) ?? 0n).toBe(0n);expect(cancelled.output.amount().coin()).toBe(draft.output.amount().coin());
});
it("binds the lender bond datum to its required on-chain hash",async()=>{
 const f=await setup(),draft=await prepareFluidAction(f.api,{kind:"create",terms},()=>{});
 const fields=fluidFields(draft.output.datum()!.asInlineData()!,10);expect(Core.toHex(fields[5].asBoundedBytes()!)).toBe(String(pd.con(0).hash()));
});
it("rejects cancellation by an unrelated wallet key",async()=>{
 const f=await setup(),draft=await prepareFluidAction(f.api,{kind:"create",terms},()=>{});const fields=fluidFields(draft.output.datum()!.asInlineData()!,10);fields[3]=pd.con(0,[pd.bytes("44".repeat(28))]);draft.output.setDatum(Core.Datum.newInlineData(pd.con(0,fields)));const utxo=new Core.TransactionUnspentOutput(new Core.TransactionInput(draft.tx.getId(),0n),draft.output);f.ledger.outputs.set(point(utxo.input()),utxo);
 await expect(prepareFluidAction(f.api,{kind:"cancel",outpoint:point(utxo.input())},()=>{})).rejects.toThrow("does not own");
});
it("verifies funding signatures and hands the reviewed transaction to Dingo",async()=>{
 const f=await setup(),draft=await prepareFluidAction(f.api,{kind:"create",terms},()=>{});
 vi.spyOn(f.blaze,"signTransaction").mockImplementation(async tx=>tx);await expect(submitFluidAction(f.api,draft,()=>{})).rejects.toThrow("sign every");
 vi.spyOn(f.blaze,"signTransaction").mockImplementation(async tx=>{const w=Core.TransactionWitnessSet.fromCbor(tx.witnessSet().toCbor());w.setVkeys(Core.CborSet.fromCore([[f.key.toPublic().hex(),f.key.sign(Core.HexBlob(tx.getId())).hex()]],Core.VkeyWitness.fromCore));tx.setWitnessSet(w);return tx;});
 const post=vi.spyOn(f.ledger,"postTransactionToChain").mockResolvedValue(draft.tx.getId());await expect(submitFluidAction(f.api,draft,()=>{})).resolves.toBe(String(draft.tx.getId()));expect(post).toHaveBeenCalledTimes(1);
});
it.each(["body","auxiliary","validation flag","validity bounds","account","configuration","reference","funding"])("rejects %s changes during wallet approval",async change=>{
 const f=await setup(),draft=await prepareFluidAction(f.api,{kind:"create",terms},()=>{}),post=vi.spyOn(f.ledger,"postTransactionToChain");
 vi.spyOn(f.blaze,"signTransaction").mockImplementation(async tx=>{
  if(change==="body")return new Core.Transaction(Core.TransactionBody.fromCore({...tx.body().toCore(),fee:tx.body().fee()+1n}),tx.witnessSet(),tx.auxiliaryData());
  if(change==="auxiliary")tx.setAuxiliaryData(Core.AuxiliaryData.fromCbor(Core.HexBlob("a1016161")));
  if(change==="validation flag")return Core.Transaction.fromCbor(Core.TxCBOR(`84${tx.body().toCbor()}${tx.witnessSet().toCbor()}f4${tx.auxiliaryData()?.toCbor()??"f6"}`));
  if(change==="validity bounds"){const body=Core.TransactionBody.fromCore(tx.body().toCore());body.setTtl(Core.Slot(draft.validUntil-1));return new Core.Transaction(body,tx.witnessSet(),tx.auxiliaryData());}
  if(change==="account")vi.spyOn(f.api,"getChangeAddress").mockResolvedValue(Core.addressFromCredential(1,Core.Credential.fromCore({type:Core.CredentialType.KeyHash,hash:Core.Hash28ByteBase16("44".repeat(28))})).toBytes());
  if(change==="configuration")f.ledger.outputs.delete(point(f.configuration.utxo.input()));
  if(change==="reference")f.ledger.outputs.delete(point(fluidRpcOutput(references.items[0]).input()));
  if(change==="funding")f.ledger.outputs.delete(point(draft.tx.body().inputs().values()[0]));
  return tx;
 });
 const expected=change==="account"?"Wallet account changed":["configuration","reference","funding"].includes(change)?"changed or were spent":"Wallet changed the reviewed FluidTokens transaction";
 await expect(submitFluidAction(f.api,draft,()=>{})).rejects.toThrow(expected);expect(post).not.toHaveBeenCalled();
});
it("rejects expired drafts and network drift before signing",async()=>{
 const f=await setup(),draft=await prepareFluidAction(f.api,{kind:"create",terms},()=>{}),sign=vi.spyOn(f.blaze,"signTransaction");f.clock.slot=draft.validUntil;
 await expect(submitFluidAction(f.api,draft,()=>{})).rejects.toThrow("draft expired");expect(sign).not.toHaveBeenCalled();f.clock.slot--;
 vi.mocked(f.api.getNetworkId).mockResolvedValue(0);await expect(submitFluidAction(f.api,draft,()=>{})).rejects.toThrow("Wallet network changed");expect(sign).not.toHaveBeenCalled();
});
it("rejects a signature for a different transaction",async()=>{
 const f=await setup(),draft=await prepareFluidAction(f.api,{kind:"create",terms},()=>{});
 vi.spyOn(f.blaze,"signTransaction").mockImplementation(async tx=>{const w=Core.TransactionWitnessSet.fromCbor(tx.witnessSet().toCbor());w.setVkeys(Core.CborSet.fromCore([[f.key.toPublic().hex(),f.key.sign(Core.HexBlob("22".repeat(32))).hex()]],Core.VkeyWitness.fromCore));tx.setWitnessSet(w);return tx;});
 await expect(submitFluidAction(f.api,draft,()=>{})).rejects.toThrow("sign every FluidTokens funding key");
});
it("authenticates every reference script before creating a pool",async()=>{
 const f=await setup(),reference=fluidRpcOutput(references.items[0]);reference.output().setScriptRef(fluidRpcOutput(references.items[1]).output().scriptRef()!);f.ledger.outputs.set(point(reference.input()),reference);
 await expect(prepareFluidAction(f.api,{kind:"create",terms},()=>{})).rejects.toThrow("did not verify the deployed");expect(f.ledger.evaluations).toBe(0);
});

it("funds a loan from a newly created static pool against the deployed borrowing validators",async()=>{
 const f=await setup(),created=await prepareFluidAction(f.api,{kind:"create",terms},()=>{});
 for(const input of created.tx.body().inputs().values())f.ledger.outputs.delete(point(input));
 for(const [index,output]of created.tx.body().outputs().entries()){const u=new Core.TransactionUnspentOutput(new Core.TransactionInput(created.tx.getId(),BigInt(index)),output);f.ledger.outputs.set(point(u.input()),u);}
 const poolInput=new Core.TransactionInput(created.tx.getId(),0n),pool=f.ledger.outputs.get(point(poolInput))!,fields=fluidFields(pool.output().datum()!.asInlineData()!,10),cd=fluidFields(fields[2],12),configuration=fluidFields(f.configuration.utxo.output().datum()!.asInlineData()!,30);
 const hash=(index:number)=>Core.toHex(configuration[index].asBoundedBytes()!);
 const borrowerPolicy=hash(4),lenderPolicy=hash(5),loanPolicy=hash(6),loanSpend=hash(10),borrowHash=hash(23);
 const refs=[f.configuration.utxo,...references.items.slice(0,2).map(fluidRpcOutput),...borrowReferences.items.map(fluidRpcOutput)].sort((a,b)=>point(a.input()).localeCompare(point(b.input())));
 for(const u of refs)f.ledger.outputs.set(point(u.input()),u);
 for(const scriptHash of [FLUID_POOL_POLICY,hash(8),borrowHash,borrowerPolicy,lenderPolicy,loanPolicy])expect(refs.some(u=>u.output().scriptRef()?.hash()===scriptHash)).toBe(true);
 const configIndex=refs.findIndex(u=>u.input().toCbor()===f.configuration.utxo.input().toCbor());
 const id=Core.toHex(blake2b(Core.fromHex(fluidRefData(poolInput).toCbor()),undefined,28)),wanted=10000000n,validUntil=f.clock.slot+100;
 const lendDate=1596059091000n+(BigInt(validUntil)-4492800n)*1000n;
 const collateral=fields[6].asList()!.get(0);
 const loanDatum=pd.con(0,[pd.int(0n),pd.int(wanted),pd.int(lendDate),pd.int(0n),cd[2],cd[4],cd[0],cd[1],cd[3],cd[5],cd[6],cd[7],cd[8],cd[9],cd[10],pd.bytes("504f4f4c"+created.name),collateral]);
 const continuing=new Core.TransactionOutput(pool.output().address(),new Core.Value(pool.output().amount().coin()-wanted,new Map(pool.output().amount().multiasset())));continuing.setDatum(pool.output().datum()!);
 const loanOutput=new Core.TransactionOutput(Core.addressFromCredentials(1,Core.Credential.fromCore({type:Core.CredentialType.ScriptHash,hash:Core.Hash28ByteBase16(loanSpend)}),Core.Credential.fromCore(f.address.getProps().delegationPart!)),new Core.Value(3000000n,new Map([[Core.AssetId(token),10000000n],[Core.AssetId(loanPolicy+id),1n]])));loanOutput.setDatum(Core.Datum.newInlineData(loanDatum));
 const lenderOutput=new Core.TransactionOutput(f.address,new Core.Value(2000000n,new Map([[Core.AssetId(lenderPolicy+id),1n]])));lenderOutput.setDatum(Core.Datum.newInlineData(pd.con(0)));
 const borrowerOutput=new Core.TransactionOutput(f.address,new Core.Value(2000000n,new Map([[Core.AssetId(borrowerPolicy+id),1n]])));
 const reward=(h:string)=>Core.RewardAccount.fromCredential({type:Core.CredentialType.ScriptHash,hash:Core.Hash28ByteBase16(h)},1),poolReward=reward(FLUID_POOL_POLICY);
 const builder=f.blaze.newTransaction().addInput(pool,pd.con(0)).addOutput(continuing).addOutput(loanOutput).addOutput(lenderOutput).addOutput(borrowerOutput).setValidFrom(Core.Slot(f.clock.slot)).setValidUntil(Core.Slot(validUntil));
 for(const ref of refs)builder.addReferenceInput(ref);
 for(const policy of [borrowerPolicy,lenderPolicy])builder.addMint(Core.PolicyId(policy),new Map([[Core.AssetName(id),1n]]),pd.con(0,[pd.list([fluidRefData(poolInput)])]));
 builder.addMint(Core.PolicyId(loanPolicy),new Map([[Core.AssetName(id),1n]]),context=>pd.con(0,[pd.int(BigInt(configIndex)),pd.con(1),pd.int(BigInt(1+context.sortedMints.length+context.sortedWithdrawals.findIndex(w=>w.rewardAccount===poolReward)))]));
 builder.addWithdrawal(poolReward,0n,pd.con(0,[pd.int(BigInt(configIndex)),pd.con(1)]));
 const borrowAction=pd.con(0,[fields[4],pd.int(2n),pd.int(3n),pd.int(-1n),pd.int(0n),pd.int(-1n),pd.int(wanted),pd.bytes(created.name),pd.int(-1n)]);
 builder.addWithdrawal(reward(borrowHash),0n,pd.con(0,[pd.int(BigInt(configIndex)),pd.list([borrowAction])]));
 const borrowed=await builder.complete();expect(borrowed.body().outputs()[1].datum()!.asInlineData()!.toCbor()).toBe(loanDatum.toCbor());expect(f.ledger.evaluations).toBeGreaterThan(1);
});
