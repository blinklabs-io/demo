import { poolImage } from "../src/server/poolImage";

export async function onRequestGet({
  request,
  waitUntil,
}: {
  request: Request;
  waitUntil(promise: Promise<unknown>): void;
}) {
  const key = new URL(request.url);
  const params = key.searchParams;
  key.search = new URLSearchParams({
    url: params.get("url") ?? "",
    hash: (params.get("hash") ?? "").toLowerCase(),
    offset: String(Number(params.get("offset") ?? "0")),
  }).toString();
  const imageRequest = new Request(key, { signal: request.signal });
  const cache = await caches.open("pool-images");
  const cached = await cache.match(imageRequest);
  if (cached) return cached;
  const response = await poolImage(imageRequest);
  if (response.ok) waitUntil(cache.put(imageRequest, response.clone()));
  return response;
}
