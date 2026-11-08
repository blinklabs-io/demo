import { parsePopularPools, POPULAR_POOL_LIMIT } from "../lib/minswap/popular";

export async function marketPools(request: Request): Promise<Response> {
  if (new URL(request.url).search) return new Response("Unexpected market query.", { status: 400 });
  try {
    const response = await fetch("https://api-mainnet-prod.minswap.org/v1/pools/metrics", {
      method: "POST", redirect: "manual", credentials: "omit",
      signal: AbortSignal.any([request.signal, AbortSignal.timeout(10000)]),
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({ limit: POPULAR_POOL_LIMIT, only_verified: true, sort_field: "volume_24h", sort_direction: "desc", protocols: ["MinswapV2"], currency: "ada" }),
    });
    if (!response.ok || !response.body) { await response.body?.cancel(); throw new Error("Market service unavailable."); }
    const reader = response.body.getReader();
    const chunks: Uint8Array[] = [];
    let size = 0;
    try {
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        size += value.length;
        if (size > 262144) throw new Error("Oversized market response.");
        chunks.push(value);
      }
    } finally { await reader.cancel(); reader.releaseLock(); }
    const bytes = new Uint8Array(size);
    let offset = 0;
    for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
    const pools = parsePopularPools(JSON.parse(new TextDecoder().decode(bytes)));
    return Response.json({ pools }, { headers: { "Cache-Control": "public, max-age=60", "X-Content-Type-Options": "nosniff" } });
  } catch {
    return new Response("Market volumes are unavailable. Retry or browse all pools.", { status: 502, headers: { "Cache-Control": "no-store" } });
  }
}
