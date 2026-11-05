import { creationTools } from "../creationTools";
import { useWalletStore } from "../../stores/walletStore";
import { useTipStore } from "../../stores/tipStore";
import { useMempoolStore } from "../../stores/mempoolStore";
import { NETWORK_STORAGE_KEY, networkSearch, isDingoNetworkId, type DingoNetworkId } from "./networks";
import { DINGO_NETWORK } from "./config";

export function networkDestination(pathname: string): string {
  const path = pathname.split(/[?#]/)[0].replace(/\/+$/, "") || "/";
  const capabilities = ["/", "/api", "/wallet", "/wallet/send", "/wallet/delegate", "/wallet/swap", "/wallet/tools", "/participate", "/explorer", "/explorer/mempool", "/explorer/network", "/explorer/epoch", "/explorer/pools", "/explorer/dreps", "/explorer/governance", "/explorer/surveys", "/explorer/surveys/new"];
  if (capabilities.includes(path) || creationTools.some((tool) => tool.to === path)) return path;
  if (/^\/explorer\/proposal\//.test(path)) return "/explorer/governance";
  if (/^\/explorer\/surveys\//.test(path)) return "/explorer/surveys";
  if (/^\/explorer\/drep\//.test(path)) return "/explorer/dreps";
  if (/^\/explorer\/pool\//.test(path)) return "/explorer/pools";
  if (/^\/explorer\/epoch\//.test(path)) return "/explorer/epoch";
  if (/^\/explorer\/(?:tx|block|address|account|asset|policy|handle|metadata|lookup)\//.test(path)) return "/explorer";
  return "/";
}

export function reloadDingoPage(destination: string, selected?: DingoNetworkId) {
  useWalletStore.getState().disconnect();
  useTipStore.getState().stop();
  useMempoolStore.getState().stop();
  if (selected !== undefined) window.localStorage.setItem(NETWORK_STORAGE_KEY, selected);
  window.location.assign(destination);
}

export function changeDingoNetwork(next: DingoNetworkId) {
  if (!isDingoNetworkId(next)) throw new Error("Choose Preview or Preprod.");
  if (next === DINGO_NETWORK.id) return;
  reloadDingoPage(`${networkDestination(window.location.pathname)}${networkSearch("", next)}`, next);
}
