import { parsePopularPools, POPULAR_POOL_LIMIT } from "../lib/minswap/popular";

export async function marketPools(request: Request): Promise<Response> {
  if (new URL(request.url).search) return new Response("Unexpected market query.", { status: 400 });
  let failure = "abort_signal";
  try {
    const signal = AbortSignal.any([request.signal, AbortSignal.timeout(10000)]);
    failure = "upstream_request";
    const response = await fetch("https://api-mainnet-prod.minswap.org/v1/pools/metrics", {
      method: "POST", redirect: "manual", credentials: "omit",
      signal,
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({ limit: POPULAR_POOL_LIMIT, only_verified: true, sort_field: "volume_24h", sort_direction: "desc", protocols: ["MinswapV2"], currency: "ada" }),
    });
    failure = response.ok ? "empty_response" : `upstream_http_${response.status}`;
    if (!response.ok || !response.body) { await response.body?.cancel(); throw new Error("Market service unavailable."); }
    failure = "response_body";
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
    failure = "invalid_metrics";
    const pools = parsePopularPools(JSON.parse(new TextDecoder().decode(bytes)));
    failure = "response_encoding";
    return Response.json({ pools }, { headers: { "Cache-Control": "public, max-age=60", "X-Content-Type-Options": "nosniff" } });
  } catch {
    return new Response(JSON.stringify({ error: "Market volumes are unavailable. Retry or browse all pools.", code: failure }), { status: 502, headers: { "Content-Type": "application/json", "Cache-Control": "no-store" } });
  }
}
