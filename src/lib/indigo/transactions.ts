import { walletScriptIdentity } from "../dingo/ownedScriptOutputs";
import { Core, calculateMinAda } from "@blaze-cardano/sdk";
import { getBlaze } from "../dingo/blaze";
import type { Cip30WalletApi } from "../dingo/cip30";
import { blockfrostFetch } from "../dingo/blockfrost";
import { assertWalletSession, assertTransactionNetwork } from "../dingo/walletSession";
import { assertSignedWithKey } from "../dingo/signatureWitness";
import { pd } from "../kernel/actions";
import { INDY, INDIGO_POSITION, INDIGO_REFERENCES, indigoAddress, managerDatum, positionDatum, indigoReward, indigoAvailable } from "./data";
import { assertIndigoMainnet, readIndigoPosition, readIndigoManager } from "./read";
export type IndigoAction={kind:"stake";amount:bigint}|{kind:"adjust";point:string;amount:bigint}|{kind:"close";point:string};
async function identity(api:Cip30WalletApi,guard:()=>void){await assertWalletSession(api,guard);const address=Core.Address.fromBytes(Core.HexBlob(await api.getChangeAddress()));guard();const key=address.getProps().paymentPart;if(address.getNetworkId()!==1||key?.type!==Core.CredentialType.KeyHash)throw new Error("Connect a mainnet wallet with a payment signing key.");return {address,key:String(key.hash)};}
async function slot(guard:()=>void){const tip=await blockfrostFetch<{slot:number}>("/api/v0/blocks/latest");guard();if(!Number.isSafeInteger(tip.slot)||tip.slot<4492800||tip.slot>Number.MAX_SAFE_INTEGER-600)throw new Error("Dingo returned an invalid mainnet tip.");return tip.slot;}
export async function prepareIndigoAction(api:Cip30WalletApi,action:IndigoAction,guard:()=>void){
 if(action.kind!=="close"&&(action.amount>9223372036854775807n||action.amount< -9223372036854775807n||(action.kind==="stake"&&action.amount<=0n)))throw new Error("Enter a positive staking amount within the ledger limit.");
 await assertIndigoMainnet();const owner=await identity(api,guard),{blaze}=await getBlaze(api);guard();const manager=await readIndigoManager();guard();
 const pins=action.kind==="adjust"?INDIGO_REFERENCES.slice(0,1):INDIGO_REFERENCES,inputs=pins.map(pin=>new Core.TransactionInput(Core.TransactionId(pin.hash),0n)),references=await blaze.provider.resolveUnspentOutputs(inputs);guard();
 if(references.length!==pins.length||pins.some((pin,i)=>!references.some(ref=>ref.input().toCbor()===inputs[i].toCbor()&&ref.output().address().getNetworkId()===1&&ref.output().scriptRef()?.hash()===pin.script)))throw new Error("Dingo did not verify the deployed Indigo staking scripts.");
 const tip=await slot(guard),validUntil=tip+600,now=BigInt(Core.SLOT_CONFIG_NETWORK.Mainnet.zeroTime)+BigInt(tip-Core.SLOT_CONFIG_NETWORK.Mainnet.zeroSlot)*BigInt(Core.SLOT_CONFIG_NETWORK.Mainnet.slotLength);
 const builder=blaze.newTransaction(),outputs:Core.TransactionOutput[]=[],contractInputs=[manager.utxo,...references];references.forEach(ref=>builder.addReferenceInput(ref));
 let amount=action.kind==="close"?0n:action.amount,reward=0n,signer=owner.key,total=manager.total+amount;
 const withDatum=(address:Core.Address,value:Core.Value,data:Core.PlutusData)=>{const output=new Core.TransactionOutput(address,value);output.setDatum(Core.Datum.newInlineData(data));return output;};
 const mint=(delta:bigint)=>builder.addMint(Core.PolicyId(INDIGO_POSITION.slice(0,56)),new Map([[Core.AssetName(INDIGO_POSITION.slice(56)),delta]]),pd.con(0));
 let positionOutput:Core.TransactionOutput|undefined;
 if(action.kind==="stake"){
   builder.addInput(manager.utxo,pd.con(0,[pd.bytes(signer)]));mint(1n);
   positionOutput=withDatum(indigoAddress(),new Core.Value(2000000n,new Map([[Core.AssetId(INDIGO_POSITION),1n],[Core.AssetId(INDY),amount]])),positionDatum(signer,[],manager.snapshot));
 }else{
   const position=await readIndigoPosition(action.point);guard();const {keys}=await walletScriptIdentity(api,owner.address.toBech32());guard();if(!keys.includes(position.owner))throw new Error("This wallet does not own the Indigo staking position.");
   signer=position.owner;reward=indigoReward(manager,position);contractInputs.push(position.utxo);builder.addInput(manager.utxo,pd.con(1));
   if(action.kind==="close"){
     if(indigoAvailable(position,now)!==position.amount)throw new Error("Governance votes still lock this Indigo position.");amount=-position.amount;total=manager.total+amount;
     builder.addInput(position.utxo,pd.con(4));mint(-1n);
     const assets=new Map(position.utxo.output().amount().multiasset());assets.delete(Core.AssetId(INDIGO_POSITION));outputs.push(new Core.TransactionOutput(owner.address,new Core.Value(position.utxo.output().amount().coin()+reward,assets)));
   }else{
     if(position.amount+amount<=0n||position.amount+amount>9223372036854775807n)throw new Error("Keep a positive INDY stake or close the position.");
     if(amount<0n&&-amount>indigoAvailable(position,now))throw new Error("Governance votes lock the requested INDY withdrawal.");
     builder.addInput(position.utxo,pd.con(3,[pd.int(amount)]));
     const assets=new Map(position.utxo.output().amount().multiasset());assets.set(Core.AssetId(INDY),position.amount+amount);
     positionOutput=withDatum(position.utxo.output().address(),new Core.Value(position.utxo.output().amount().coin(),assets),positionDatum(signer,position.locks.filter(lock=>lock.end>now),manager.snapshot));
   }
 }
 if(total<0n||total>9223372036854775807n||manager.utxo.output().amount().coin()<reward)throw new Error("Indigo manager cannot settle this stake and reward.");
 const managerOutput=withDatum(manager.utxo.output().address(),new Core.Value(manager.utxo.output().amount().coin()-reward,manager.utxo.output().amount().multiasset()),managerDatum(total,manager.snapshot));
 outputs.unshift(managerOutput);if(positionOutput)outputs.push(positionOutput);
 for(const output of outputs){if(output.amount().coin()<calculateMinAda(output,blaze.params.coinsPerUtxoByte))throw new Error("Indigo staking output is below the ledger minimum ADA.");builder.addOutput(Core.TransactionOutput.fromCbor(output.toCbor()));}
 const tx=await builder.addRequiredSigner(Core.Ed25519KeyHashHex(signer)).setValidFrom(Core.Slot(tip)).setValidUntil(Core.Slot(validUntil)).complete();guard();
 const mintAmount=tx.body().mint()?.get(Core.AssetId(INDIGO_POSITION));
 if(!tx.isValid()||outputs.some((out,i)=>tx.body().outputs()[i]?.toCbor()!==out.toCbor())||(action.kind==="adjust"?!!tx.body().mint()?.size:tx.body().mint()?.size!==1||mintAmount!==(action.kind==="stake"?1n:-1n))||tx.body().outputs().slice(outputs.length).some(out=>out.address().toBytes()!==owner.address.toBytes())||(tx.body().collateralReturn()&&tx.body().collateralReturn()!.address().toBytes()!==owner.address.toBytes()))throw new Error("The built Indigo transaction differs from the reviewed outputs.");
  const funding = await assertTransactionNetwork(tx, guard, blaze.provider);
  const keys = [...new Set([signer, ...funding.flatMap((utxo) => { const key = utxo.output().address().getProps().paymentPart; return key?.type === Core.CredentialType.KeyHash ? [String(key.hash)] : []; })])];
  const snapshot = [...new Map([...funding, ...contractInputs].map((utxo) => [utxo.input().toCbor(), utxo.toCbor()])).values()];
  return { tx, blaze, outputs, reward, amount, validUntil, owner: owner.address.toBytes(), keys, snapshot, body: tx.body().toCbor(), auxiliary: tx.auxiliaryData()?.toCbor() };
}
export type IndigoDraft = Awaited<ReturnType<typeof prepareIndigoAction>>;
export async function submitIndigoAction(api: Cip30WalletApi, draft: IndigoDraft, guard: () => void) {
  const current = async () => {
    await assertIndigoMainnet();
    if ((await identity(api, guard)).address.toBytes() !== draft.owner) throw new Error("Wallet account changed. Build a new Indigo transaction.");
    if ((await slot(guard)) >= draft.validUntil) throw new Error("Indigo draft expired. Build a new transaction.");
    const original = draft.snapshot.map((cbor) => Core.TransactionUnspentOutput.fromCbor(cbor));
    const actual = await draft.blaze.provider.resolveUnspentOutputs(original.map((utxo) => utxo.input())); guard();
    if (actual.length !== original.length || original.some((expected) => !actual.some((utxo) => utxo.toCbor() === expected.toCbor()))) throw new Error("Indigo funding, staking, or reference inputs changed or were spent.");
  };
  await current();
  if (!draft.tx.isValid() || draft.tx.body().toCbor() !== draft.body || draft.tx.auxiliaryData()?.toCbor() !== draft.auxiliary) throw new Error("The reviewed Indigo transaction changed.");
  const signed = await draft.blaze.signTransaction(Core.Transaction.fromCbor(draft.tx.toCbor()));
  await current();
  if (!signed.isValid() || signed.body().toCbor() !== draft.body || signed.auxiliaryData()?.toCbor() !== draft.auxiliary) throw new Error("Wallet changed the reviewed Indigo transaction.");
  for (const key of draft.keys) assertSignedWithKey(signed, key, "Wallet did not sign every Indigo funding key.");
  await assertTransactionNetwork(signed, guard, draft.blaze.provider);
  return String(await draft.blaze.provider.postTransactionToChain(signed, guard));
}
