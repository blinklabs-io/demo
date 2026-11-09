import { DINGO_NETWORK } from "../dingo/config";
import { assertDingoTransactionBackends } from "../dingo/walletSession";
import { parseOutpoint, readScriptOutpoint, readOwnedScriptPage, type WalletScriptIdentity } from "../dingo/ownedScriptOutputs";
import { decodeSplashOrder, splashOrderAddress } from "./data";
export async function assertSplashMainnet() {
  if (DINGO_NETWORK.id !== "mainnet") throw new Error("Splash orders require Cardano Mainnet.");
  await assertDingoTransactionBackends();
}
export async function readSplashOrder(outpoint: string, signal?: AbortSignal) {
  const input = parseOutpoint(outpoint);
  await assertSplashMainnet();
  return decodeSplashOrder(await readScriptOutpoint(input,"Splash order",signal));
}
export async function readSplashOrders(identity: WalletScriptIdentity, cursor = "", signal?: AbortSignal) {
  await assertSplashMainnet();
  const {records,errors,nextToken} = await readOwnedScriptPage<ReturnType<typeof decodeSplashOrder>>(identity,splashOrderAddress,(utxo,keys) => {
    const order=decodeSplashOrder(utxo);
    return keys.includes(order.cancelKey)?order:undefined;
  },cursor,signal);
  return { orders:records,errors,nextToken };
}
