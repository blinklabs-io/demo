import { decodeRpcOutput,parseOutpoint,readScriptOutpoint } from "../dingo/ownedScriptOutputs";
import { Core } from "@blaze-cardano/sdk";
import { DINGO_NETWORK } from "../dingo/config";
import { assertDingoTransactionBackends } from "../dingo/walletSession";
import { getDingoProvider } from "../dingo/utxorpc/provider";
import { hexToBytes } from "../dingo/utxorpc/bytes";
import { decodeIndigoManager,decodeIndigoPosition,indigoAddress,INDIGO_MANAGER } from "./data";
export async function assertIndigoMainnet(){if(DINGO_NETWORK.id!=="mainnet")throw new Error("Indigo staking requires Mainnet.");await assertDingoTransactionBackends();}
export async function readIndigoManager(signal?:AbortSignal){
  await assertIndigoMainnet();const response=await getDingoProvider().queryClient.inner.searchUtxos({maxItems:2,predicate:{match:{utxoPattern:{case:"cardano",value:{asset:{policyId:hexToBytes(INDIGO_MANAGER.slice(0,56)),assetName:hexToBytes(INDIGO_MANAGER.slice(56))}}}}}},{signal});signal?.throwIfAborted();
  if(response.items.length!==1||response.nextToken)throw new Error("Dingo did not identify one Indigo staking manager.");return decodeIndigoManager(decodeRpcOutput(response.items[0]));
}
export async function readIndigoPosition(point:string,signal?:AbortSignal){
  const input=parseOutpoint(point);await assertIndigoMainnet();return decodeIndigoPosition(await readScriptOutpoint(input,"Indigo position",signal));
}
export async function readIndigoPositions(keys:readonly string[],cursor="",signal?:AbortSignal){
  if(!keys.length||keys.some(key=>!/^[a-f0-9]{56}$/.test(key)))throw new Error("Wallet staking keys are unavailable.");if(cursor.length>4096)throw new Error("Indigo cursor exceeds the query limit.");
  await assertIndigoMainnet();const response=await getDingoProvider().queryClient.inner.searchUtxos({maxItems:20,startToken:cursor,predicate:{match:{utxoPattern:{case:"cardano",value:{address:{exactAddress:hexToBytes(indigoAddress().toBytes())}}}}}},{signal});signal?.throwIfAborted();
  if(response.items.length>20||response.nextToken.length>4096||(response.nextToken&&response.nextToken===cursor))throw new Error("Dingo returned an invalid Indigo staking page.");
  const positions:ReturnType<typeof decodeIndigoPosition>[]=[],errors:string[]=[],seen=new Set<string>();
  for(const row of response.items){const utxo=decodeRpcOutput(row),id=utxo.input().toCbor();if(seen.has(id))throw new Error("Dingo repeated an Indigo staking output.");seen.add(id);
    if(utxo.output().amount().multiasset()?.has(Core.AssetId(INDIGO_MANAGER)))continue;
    try{const position=decodeIndigoPosition(utxo);if(keys.includes(position.owner))positions.push(position);}catch(e){errors.push(e instanceof Error?e.message:"Unsupported Indigo output.");}
  }return {positions,errors,nextToken:response.nextToken};
}
