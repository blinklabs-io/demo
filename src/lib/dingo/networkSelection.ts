import { creationTools } from "../creationTools";
import { useWalletStore } from "../../stores/walletStore";
import { useTipStore } from "../../stores/tipStore";
import { useMempoolStore } from "../../stores/mempoolStore";
import {
  markNetworkNavigationPending,
  persistDingoNetwork,
  networkSearch,
  isDingoNetworkId,
  type DingoNetworkId,
} from "./networks";
import { DINGO_NETWORK } from "./config";

export function networkDestination(pathname: string): string {
  const path = pathname.split(/[?#]/)[0].replace(/\/+$/, "") || "/";
  const capabilities = [
    "/",
    "/api",
    "/wallet",
    "/wallet/send",
    "/wallet/delegate",
    "/wallet/swap",
    "/wallet/splash",
    "/wallet/dano",
    "/wallet/tools",
    "/participate",
    "/explorer",
    "/explorer/mempool",
    "/explorer/leios",
    "/explorer/track",
    "/explorer/network",
    "/explorer/epoch",
    "/explorer/pools",
    "/explorer/dreps",
    "/explorer/governance",
    "/explorer/surveys",
    "/explorer/surveys/new",
  ];
  if (
    capabilities.includes(path) ||
    /^\/wallet\/markets(?:\/(liquidity|lending|options|orders|marketplace))?$/.test(
      path,
    ) ||
    creationTools.some((tool) => tool.to === path)
  )
    return path;
  if (/^\/explorer\/track\//.test(path)) return "/explorer/track";
  if (/^\/explorer\/proposal\//.test(path)) return "/explorer/governance";
  if (/^\/explorer\/surveys\//.test(path)) return "/explorer/surveys";
  if (/^\/explorer\/drep\//.test(path)) return "/explorer/dreps";
  if (/^\/explorer\/pool\//.test(path)) return "/explorer/pools";
  if (/^\/explorer\/epoch\//.test(path)) return "/explorer/epoch";
  if (
    /^\/explorer\/(?:tx|block|address|account|asset|policy|handle|metadata|lookup)\//.test(
      path,
    )
  )
    return "/explorer";
  return "/";
}

export function networkSwitchDestination(
  pathname: string,
  search: string,
  hash: string,
  network: DingoNetworkId,
): string {
  const destination = networkDestination(pathname);
  const sameCapability = destination === (pathname.replace(/\/+$/, "") || "/");
  const retained = new URLSearchParams();
  const ticker = new URLSearchParams(search).get("ticker");
  if (sameCapability && destination === "/explorer/pools" && ticker !== null)
    retained.set("ticker", ticker);
  return `${destination}${networkSearch(retained.toString(), network)}${sameCapability ? hash : ""}`;
}

export function reloadDingoPage(
  destination: string,
  selected?: DingoNetworkId,
) {
  useWalletStore.getState().disconnect();
  useTipStore.getState().stop();
  useMempoolStore.getState().stop();
  if (selected !== undefined) persistDingoNetwork(selected);
  markNetworkNavigationPending();
  window.location.assign(destination);
}

export function changeDingoNetwork(next: DingoNetworkId) {
  if (!isDingoNetworkId(next)) throw new Error("Choose a supported Dingo network.");
  if (next === DINGO_NETWORK.id) return;
  reloadDingoPage(
    networkSwitchDestination(
      window.location.pathname,
      window.location.search,
      window.location.hash,
      next,
    ),
    next,
  );
}
