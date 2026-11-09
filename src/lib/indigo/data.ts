import { Core } from "@blaze-cardano/sdk";
import { pd } from "../kernel/actions";

export const INDY = "533bb94a8850ee3ccbe483106489399112b74c905342cb1792a797a0494e4459";
export const INDIGO_POSITION = "fd0d72fafee1d230a74c31ac503a192abd5b71888ae3f94128c1e6345354414b494e475f504f534954494f4e";
export const INDIGO_MANAGER = "24b458412c2a7f9acb9c53c7ec4325b36806912ed56d2f91bfcf4d265354414b494e475f4d414e414745525f4e4654";
export const INDIGO_STAKING = "112996eb011f20eacc28ded86cde177a53ed22264e0131199c983a7e";
export const INDIGO_REFERENCES = [
  { hash: "03a6b59ef3ca62527282aaf3461f374009392eb8a79aad635196077c17e74b28", script: INDIGO_STAKING },
  { hash: "71dc6b81e8832192bb28ecbc6a4f71b6e0dc0407c708f169020804371450b4e7", script: INDIGO_POSITION.slice(0,56) },
];
export const indigoAddress = () => Core.addressFromCredential(1,Core.Credential.fromCore({type:Core.CredentialType.ScriptHash,hash:Core.Hash28ByteBase16(INDIGO_STAKING)}));
export function indigoFields(data:Core.PlutusData,count:number,tag=0n) {
  const con=data.asConstrPlutusData();
  if(!con||con.getAlternative()!==tag||con.getData().getLength()!==count)throw new Error("Unsupported Indigo staking datum.");
  return Array.from({length:count},(_,i)=>con.getData().get(i));
}
function integer(data:Core.PlutusData) {const n=data.asInteger();if(n===undefined||n<0n||n>9223372036854775807n)throw new Error("Invalid Indigo staking quantity.");return n;}
export type IndigoLock={poll:bigint;amount:bigint;end:bigint};
export const managerDatum=(total:bigint,snapshot:bigint)=>pd.con(0,[pd.con(0,[pd.int(total),pd.con(0,[pd.int(snapshot)])])]);
export const positionDatum=(owner:string,locks:IndigoLock[],snapshot:bigint)=>pd.con(1,[pd.con(0,[pd.bytes(owner),pd.list(locks.map(lock=>pd.list([pd.int(lock.poll),pd.con(0,[pd.int(lock.amount),pd.int(lock.end)])]))),pd.con(0,[pd.int(snapshot)])])]);
function datum(utxo:Core.TransactionUnspentOutput,asset:string) {
  const out=utxo.output();
  if(out.address().toBytes()!==indigoAddress().toBytes()||out.amount().multiasset()?.get(Core.AssetId(asset))!==1n)throw new Error("Not an authenticated Indigo staking output.");
  const d=out.datum()?.asInlineData();if(!d)throw new Error("Indigo staking requires an inline datum.");return d;
}
export function decodeIndigoManager(utxo:Core.TransactionUnspentOutput) {
  const [inner]=indigoFields(datum(utxo,INDIGO_MANAGER),1),[total,snapshot]=indigoFields(inner,2);
  return {utxo,total:integer(total),snapshot:integer(indigoFields(snapshot,1)[0])};
}
export function decodeIndigoPosition(utxo:Core.TransactionUnspentOutput) {
  const [inner]=indigoFields(datum(utxo,INDIGO_POSITION),1,1n),[key,list,snapshot]=indigoFields(inner,3),bytes=key.asBoundedBytes(),locks=list.asList();
  if(!bytes||bytes.length!==28||!locks||locks.getLength()>1000)throw new Error("Invalid Indigo staking owner or governance locks.");
  const locked=Array.from({length:locks.getLength()},(_,i)=>{const tuple=locks.get(i).asList();if(!tuple||tuple.getLength()!==2)throw new Error("Invalid Indigo governance lock.");const poll=tuple.get(0),[amount,end]=indigoFields(tuple.get(1),2);return {poll:integer(poll),amount:integer(amount),end:integer(end)};});
  const amount=utxo.output().amount().multiasset()?.get(Core.AssetId(INDY))??0n;
  if(amount<=0n||amount>9223372036854775807n||locked.some(lock=>lock.amount>amount))throw new Error("Invalid staked INDY amount.");
  return {utxo,owner:Core.toHex(bytes),locks:locked,snapshot:integer(indigoFields(snapshot,1)[0]),amount};
}
export type IndigoManager=ReturnType<typeof decodeIndigoManager>;
export type IndigoPosition=ReturnType<typeof decodeIndigoPosition>;
export function indigoReward(manager:IndigoManager,position:IndigoPosition) {
  if(manager.snapshot<position.snapshot||manager.total<position.amount)throw new Error("Indigo staking snapshots are inconsistent.");
  return (manager.snapshot-position.snapshot)*position.amount/1000000000000n;
}
export function indigoAvailable(position:IndigoPosition,now:bigint) {return position.amount-position.locks.filter(lock=>lock.end>now).reduce((maximum,lock)=>lock.amount>maximum?lock.amount:maximum,0n);}
export const indigoPoint=(position:{utxo:Core.TransactionUnspentOutput})=>`${position.utxo.input().transactionId()}#${position.utxo.input().index()}`;
