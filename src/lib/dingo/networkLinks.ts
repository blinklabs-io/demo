import type { To } from "react-router";
import { DINGO_NETWORK } from "./config";
import { networkSearch } from "./networks";

function external(path: string) {
  return /^(?:[a-z][a-z0-9+.-]*:|\/\/)/i.test(path);
}
function selectedSearch(search: string) {
  return new URLSearchParams(search).has("network")
    ? search
    : networkSearch(search, DINGO_NETWORK.id);
}
export function networkTo(to: To): To {
  if (typeof to !== "string") {
    if (to.pathname && external(to.pathname)) return to;
    if (!to.pathname && !to.search && to.hash) return to;
    return { ...to, search: selectedSearch(to.search ?? "") };
  }
  if (external(to) || to.startsWith("#")) return to;
  const hashAt = to.indexOf("#");
  const hash = hashAt < 0 ? "" : to.slice(hashAt);
  const pathAndSearch = hashAt < 0 ? to : to.slice(0, hashAt);
  const queryAt = pathAndSearch.indexOf("?");
  const path = queryAt < 0 ? pathAndSearch : pathAndSearch.slice(0, queryAt);
  const search = queryAt < 0 ? "" : pathAndSearch.slice(queryAt);
  return `${path}${selectedSearch(search)}${hash}`;
}
export function networkHref(href: string): string {
  return networkTo(href) as string;
}
