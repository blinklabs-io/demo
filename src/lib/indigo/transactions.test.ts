import { decodeRpcOutput } from "../dingo/ownedScriptOutputs";
// @vitest-environment node
import { Blaze,ColdWallet,Core,Provider } from "@blaze-cardano/sdk";
import { makeUplcEvaluator } from "@blaze-cardano/vm";
import { beforeAll,expect,it,vi } from "vitest";
import { getBlaze } from "../dingo/blaze";
import { blockfrostFetch } from "../dingo/blockfrost";
import { DingoProvider } from "../dingo/utxorpc/DingoProvider";
import { phaseTwoParams } from "../kernel/phaseTwo.fixture";
import type { Cip30WalletApi } from "../dingo/cip30";
import { decodeIndigoManager,decodeIndigoPosition,indigoPoint,INDY,INDIGO_POSITION,positionDatum,managerDatum } from "./data";
import { readIndigoManager,readIndigoPosition } from "./read";
import { prepareIndigoAction,submitIndigoAction } from "./transactions";
import managerFixture from "./manager.fixture.json";
import refsFixture from "./references.fixture.json";
vi.mock("../dingo/config",()=>({DINGO_NETWORK:{id:"mainnet",label:"Mainnet",networkMagic:764824073},DINGO_CONFIG:{blockfrostUrl:"http://localhost",utxorpcUrl:"http://localhost"}}));
vi.mock("../dingo/blaze",()=>({getBlaze:vi.fn()}));vi.mock("../dingo/blockfrost",()=>({blockfrostFetch:vi.fn()}));
vi.mock("./read",async original=>({...await original<typeof import("./read")>(),assertIndigoMainnet:vi.fn(),readIndigoManager:vi.fn(),readIndigoPosition:vi.fn()}));
beforeAll(()=>Core.initCrypto());const point=(input:Core.TransactionInput)=>`${input.transactionId()}#${input.index()}`;
function fixture(item:{nativeBytes:string;txoRef:{hash:string;index:number}}){return decodeRpcOutput({nativeBytes:Uint8Array.from(atob(item.nativeBytes),c=>c.charCodeAt(0)),txoRef:{hash:Uint8Array.from(atob(item.txoRef.hash),c=>c.charCodeAt(0)),index:item.txoRef.index}});}
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
async function setup(){
 vi.restoreAllMocks();vi.clearAllMocks();const clock={slot:202627200};vi.mocked(blockfrostFetch).mockImplementation(async <T>(path:string)=>{if(path==="/api/v0/epochs/latest/parameters")return phaseTwoParams as T;if(path==="/api/v0/blocks/latest")return {slot:clock.slot}as T;throw new Error(path);});
 const ledger=new Ledger(await new DingoProvider().getParameters()),manager=decodeIndigoManager(fixture(managerFixture.items[0]));for(const u of [manager.utxo,...refsFixture.items.map(fixture)])ledger.outputs.set(point(u.input()),u);
 const key=Core.Ed25519PrivateKey.fromNormalHex(Core.Ed25519PrivateNormalKeyHex("11".repeat(32))),address=Core.addressFromCredential(1,Core.Credential.fromCore({type:Core.CredentialType.KeyHash,hash:key.toPublic().hash().hex()}));
 for(let i=0;i<3;i++){const u=new Core.TransactionUnspentOutput(new Core.TransactionInput(Core.TransactionId("aa".repeat(32)),BigInt(i)),new Core.TransactionOutput(address,new Core.Value(i===0?1000000000n:50000000n,i===0?new Map([[Core.AssetId(INDY),1000000000n]]):undefined)));ledger.outputs.set(point(u.input()),u);}
 const api={getNetworkId:vi.fn(async()=>1),getChangeAddress:async()=>address.toBytes(),getUsedAddresses:async()=>[address.toBytes()],getUnusedAddresses:async()=>[]}as unknown as Cip30WalletApi;
 const blaze=await Blaze.from(ledger,new ColdWallet(address,1,ledger));vi.mocked(getBlaze).mockResolvedValue({blaze}as unknown as Awaited<ReturnType<typeof getBlaze>>);vi.mocked(readIndigoManager).mockImplementation(async()=>decodeIndigoManager([...ledger.outputs.values()].find(u=>u.output().amount().multiasset()?.has(Core.AssetId("24b458412c2a7f9acb9c53c7ec4325b36806912ed56d2f91bfcf4d265354414b494e475f4d414e414745525f4e4654")))!));vi.mocked(readIndigoPosition).mockImplementation(async ref=>decodeIndigoPosition(ledger.outputs.get(ref)!));
 const apply=(tx:Core.Transaction)=>{for(const input of tx.body().inputs().values())ledger.outputs.delete(point(input));return tx.body().outputs().map((output,i)=>{const u=new Core.TransactionUnspentOutput(new Core.TransactionInput(tx.getId(),BigInt(i)),output);ledger.outputs.set(point(u.input()),u);return u;});};
 return {ledger,key,address,api,blaze,clock,manager,apply};
}
it("opens, adjusts, claims and closes an INDY position with the deployed mainnet scripts",async()=>{
 const f=await setup();const opened=await prepareIndigoAction(f.api,{kind:"stake",amount:100000000n},()=>{});expect(f.ledger.evaluations).toBeGreaterThan(0);
 const [,position]=f.apply(opened.tx);expect(decodeIndigoPosition(position).amount).toBe(100000000n);
 const added=await prepareIndigoAction(f.api,{kind:"adjust",point:indigoPoint({utxo:position}),amount:50000000n},()=>{});const [,larger]=f.apply(added.tx);expect(decodeIndigoPosition(larger).amount).toBe(150000000n);
 const current=await readIndigoManager();const rewardOut=new Core.TransactionOutput(current.utxo.output().address(),Core.Value.fromCbor(current.utxo.output().amount().toCbor()));rewardOut.setDatum(Core.Datum.newInlineData(managerDatum(current.total,current.snapshot+10000000000n)));f.ledger.outputs.set(point(current.utxo.input()),new Core.TransactionUnspentOutput(current.utxo.input(),rewardOut));
 const claimed=await prepareIndigoAction(f.api,{kind:"adjust",point:indigoPoint({utxo:larger}),amount:0n},()=>{});expect(claimed.reward).toBe(1500000n);expect(claimed.outputs[0].amount().coin()).toBe(current.utxo.output().amount().coin()-1500000n);const [,same]=f.apply(claimed.tx);expect(decodeIndigoPosition(same).amount).toBe(150000000n);
 const removed=await prepareIndigoAction(f.api,{kind:"adjust",point:indigoPoint({utxo:same}),amount:-50000000n},()=>{});const [,smaller]=f.apply(removed.tx);expect(decodeIndigoPosition(smaller).amount).toBe(100000000n);
 const closed=await prepareIndigoAction(f.api,{kind:"close",point:indigoPoint({utxo:smaller})},()=>{});expect(closed.tx.body().mint()?.get(Core.AssetId(INDIGO_POSITION))).toBe(-1n);expect(closed.outputs[1].amount().multiasset()?.get(Core.AssetId(INDY))).toBe(100000000n);
});
it("enforces governance locks and preserves active votes on partial withdrawal",async()=>{
 const f=await setup(),opened=await prepareIndigoAction(f.api,{kind:"stake",amount:100000000n},()=>{}),[,position]=f.apply(opened.tx),decoded=decodeIndigoPosition(position);
 const now=BigInt(Core.SLOT_CONFIG_NETWORK.Mainnet.zeroTime)+BigInt(f.clock.slot-Core.SLOT_CONFIG_NETWORK.Mainnet.zeroSlot)*1000n;
 const lockedOut=new Core.TransactionOutput(position.output().address(),Core.Value.fromCbor(position.output().amount().toCbor()));lockedOut.setDatum(Core.Datum.newInlineData(positionDatum(decoded.owner,[{poll:4n,amount:60000000n,end:now+100000n},{poll:5n,amount:50000000n,end:now+100000n},{poll:3n,amount:90000000n,end:now-100000n}],decoded.snapshot)));
 const locked=new Core.TransactionUnspentOutput(position.input(),lockedOut);f.ledger.outputs.set(point(locked.input()),locked);
 await expect(prepareIndigoAction(f.api,{kind:"close",point:indigoPoint({utxo:locked})},()=>{})).rejects.toThrow("Governance votes still lock");
 await expect(prepareIndigoAction(f.api,{kind:"adjust",point:indigoPoint({utxo:locked}),amount:-40000001n},()=>{})).rejects.toThrow("Governance votes lock");
 const partial=await prepareIndigoAction(f.api,{kind:"adjust",point:indigoPoint({utxo:locked}),amount:-40000000n},()=>{});const [,remaining]=f.apply(partial.tx);expect(decodeIndigoPosition(remaining).locks).toEqual([{poll:4n,amount:60000000n,end:now+100000n},{poll:5n,amount:50000000n,end:now+100000n}]);
 f.clock.slot+=101;const closed=await prepareIndigoAction(f.api,{kind:"close",point:indigoPoint({utxo:remaining})},()=>{});expect(closed.amount).toBe(-60000000n);
});
it("rejects unauthorized ownership and changed reference scripts",async()=>{
 const f=await setup(),opened=await prepareIndigoAction(f.api,{kind:"stake",amount:100000000n},()=>{}),[,position]=f.apply(opened.tx);
 const foreign=Core.addressFromCredential(1,Core.Credential.fromCore({type:Core.CredentialType.KeyHash,hash:Core.Hash28ByteBase16("55".repeat(28))}));f.api.getChangeAddress=async()=>foreign.toBytes();f.api.getUsedAddresses=async()=>[];
 await expect(prepareIndigoAction(f.api,{kind:"close",point:indigoPoint({utxo:position})},()=>{})).rejects.toThrow("does not own");
 f.ledger.outputs.delete("03a6b59ef3ca62527282aaf3461f374009392eb8a79aad635196077c17e74b28#0");await expect(prepareIndigoAction(f.api,{kind:"stake",amount:1000000n},()=>{})).rejects.toThrow("deployed Indigo staking scripts");
});
it("requires verified wallet signatures and submits the unchanged reviewed transaction",async()=>{
 const f=await setup(),draft=await prepareIndigoAction(f.api,{kind:"stake",amount:100000000n},()=>{});const send=vi.spyOn(f.ledger,"postTransactionToChain").mockResolvedValue(draft.tx.getId());
 vi.spyOn(f.blaze,"signTransaction").mockImplementation(async tx=>{const witness=Core.VkeyWitness.fromCore([f.key.toPublic().hex(),f.key.sign(Core.HexBlob(tx.getId())).hex()]);const w=Core.TransactionWitnessSet.fromCbor(tx.witnessSet().toCbor());w.setVkeys(Core.CborSet.fromCore([witness.toCore()],Core.VkeyWitness.fromCore));tx.setWitnessSet(w);return tx;});
 await expect(submitIndigoAction(f.api,draft,()=>{})).resolves.toBe(String(draft.tx.getId()));expect(send).toHaveBeenCalledTimes(1);
});
it.each(["account","expiry","input"])("rejects stale %s before signing",async kind=>{
 const f=await setup(),draft=await prepareIndigoAction(f.api,{kind:"stake",amount:100000000n},()=>{}),sign=vi.spyOn(f.blaze,"signTransaction");
 if(kind==="account")f.api.getChangeAddress=async()=>Core.addressFromCredential(1,Core.Credential.fromCore({type:Core.CredentialType.KeyHash,hash:Core.Hash28ByteBase16("55".repeat(28))})).toBytes();
 if(kind==="expiry")f.clock.slot=draft.validUntil;
 if(kind==="input")f.ledger.outputs.delete(point(draft.tx.body().inputs().values()[0]));
 await expect(submitIndigoAction(f.api,draft,()=>{})).rejects.toThrow(kind==="account"?"Wallet account changed":kind==="expiry"?"expired":"changed or were spent");expect(sign).not.toHaveBeenCalled();
});
it("rejects a wallet that returns an unsigned transaction",async()=>{
 const f=await setup(),draft=await prepareIndigoAction(f.api,{kind:"stake",amount:100000000n},()=>{});vi.spyOn(f.blaze,"signTransaction").mockImplementation(async tx=>tx);await expect(submitIndigoAction(f.api,draft,()=>{})).rejects.toThrow("sign every Indigo funding key");
});
it.each([false,true])("rejects body mutations after wallet signing=%s",async after=>{
 const f=await setup(),draft=await prepareIndigoAction(f.api,{kind:"stake",amount:100000000n},()=>{});
 const mutate=(tx:Core.Transaction)=>{const body=Core.TransactionBody.fromCbor(tx.body().toCbor());body.setFee(body.fee()+1n);return new Core.Transaction(body,tx.witnessSet(),tx.auxiliaryData());};
 if(after)vi.spyOn(f.blaze,"signTransaction").mockImplementation(async tx=>mutate(tx));else draft.tx=mutate(draft.tx);
 await expect(submitIndigoAction(f.api,draft,()=>{})).rejects.toThrow(after?"Wallet changed the reviewed":"reviewed Indigo transaction changed");
});

it.each(["auxiliary","validation"])("rejects signed %s changes",async kind=>{
 const f=await setup(),draft=await prepareIndigoAction(f.api,{kind:"stake",amount:100000000n},()=>{});vi.spyOn(f.blaze,"signTransaction").mockImplementation(async tx=>{if(kind==="validation")return Core.Transaction.fromCbor(Core.TxCBOR(`84${tx.body().toCbor()}${tx.witnessSet().toCbor()}f4${tx.auxiliaryData()?.toCbor()??"f6"}`));else tx.setAuxiliaryData(Core.AuxiliaryData.fromCbor(Core.HexBlob("a1016161")));return tx;});await expect(submitIndigoAction(f.api,draft,()=>{})).rejects.toThrow("Wallet changed the reviewed");
});
it("rejects manager changes while the wallet is signing",async()=>{
 const f=await setup(),draft=await prepareIndigoAction(f.api,{kind:"stake",amount:100000000n},()=>{});vi.spyOn(f.blaze,"signTransaction").mockImplementation(async tx=>{f.ledger.outputs.delete(point(f.manager.utxo.input()));return tx;});await expect(submitIndigoAction(f.api,draft,()=>{})).rejects.toThrow("changed or were spent");
});
