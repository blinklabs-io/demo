import { marketPools } from "../src/server/marketPools";

export async function onRequestGet({ request, waitUntil }: { request: Request; waitUntil(promise: Promise<unknown>): void }) {
  if (new URL(request.url).search) return marketPools(request);
  const cache = await caches.open("market-pools");
  const cached = await cache.match(request);
  if (cached) return cached;
  const response = await marketPools(request);
  if (response.ok) waitUntil(cache.put(request, response.clone()));
  return response;
}
