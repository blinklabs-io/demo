import { poolImage } from "../src/server/poolImage";

export async function onRequestGet({
  request,
  waitUntil,
}: {
  request: Request;
  waitUntil(promise: Promise<unknown>): void;
}) {
  const cache = await caches.open("pool-images");
  const cached = await cache.match(request);
  if (cached) return cached;
  const response = await poolImage(request);
  if (response.ok) waitUntil(cache.put(request, response.clone()));
  return response;
}
