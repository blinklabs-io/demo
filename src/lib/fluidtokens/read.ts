import { DINGO_NETWORK } from "../dingo/config";
import { assertDingoTransactionBackends } from "../dingo/walletSession";
import { getDingoProvider } from "../dingo/utxorpc/provider";
import { hexToBytes } from "../dingo/utxorpc/bytes";
import { parseOutpoint, readScriptOutpoint, readOwnedScriptPage, decodeRpcOutput, type WalletScriptIdentity } from "../dingo/ownedScriptOutputs";
import { decodeFluidPool, decodeFluidConfig, fluidAddress, FLUID_CONFIG_ASSET } from "./data";
export async function assertFluidMainnet() {
  if (DINGO_NETWORK.id !== "mainnet") throw new Error("FluidTokens pools require Cardano Mainnet.");
  await assertDingoTransactionBackends();
}
export async function readFluidPool(outpoint: string, signal?: AbortSignal) {
  const input=parseOutpoint(outpoint);
  await assertFluidMainnet();
  return decodeFluidPool(await readScriptOutpoint(input,"FluidTokens pool",signal));
}
export async function readFluidPools(identity: WalletScriptIdentity, cursor = "", signal?: AbortSignal) {
  await assertFluidMainnet();
  const {records,errors,nextToken}=await readOwnedScriptPage<ReturnType<typeof decodeFluidPool>>(identity,fluidAddress,(utxo,keys)=>{
    const pool=decodeFluidPool(utxo);
    return pool.authTag===0n&&keys.includes(pool.key)?pool:undefined;
  },cursor,signal);
  return {pools:records,errors,nextToken};
}
export async function readFluidConfig(signal?: AbortSignal) {
  await assertFluidMainnet();
  const response = await getDingoProvider().queryClient.inner.searchUtxos({ maxItems: 2, predicate: { match: { utxoPattern: { case: "cardano", value: { asset: { policyId: hexToBytes(FLUID_CONFIG_ASSET.slice(0,56)), assetName: hexToBytes(FLUID_CONFIG_ASSET.slice(56)) } } } } } }, { signal });
  signal?.throwIfAborted();
  if (response.items.length !== 1 || response.nextToken) throw new Error("Dingo did not identify one FluidTokens configuration output.");
  return decodeFluidConfig(decodeRpcOutput(response.items[0]));
}
