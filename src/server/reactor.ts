const upstream = "https://web-api-bridge.ethernal.tech";

export async function reactor(request: Request): Promise<Response> {
  const json = (body: unknown, status = 200) => Response.json(body, { status, headers: { "Cache-Control": "no-store" } });
  if (request.method !== "GET") return json({ error: "Method not allowed." }, 405);
  const params = new URL(request.url).searchParams;
  const resource = params.get("resource");
  const hash = params.get("hash");
  if ([...params.keys()].some((key) => key !== "resource" && key !== "hash") || params.getAll("resource").length !== 1 || params.getAll("hash").length > 1)
    return json({ error: "Invalid bridge request." }, 400);
  const path = resource === "settings" && !hash ? "/settings"
    : resource === "validators" && !hash ? "/settings/validatorChangeStatus"
    : resource === "transfer" && hash && /^[a-f0-9]{64}$/.test(hash) ? `/bridgeTransaction/byTxHash/prime/${hash}` : null;
  if (!path) return json({ error: "Invalid bridge request." }, 400);
  try {
    const response = await fetch(upstream + path, {
      signal: AbortSignal.any([request.signal, AbortSignal.timeout(10_000)]),
      redirect: "error", credentials: "omit", headers: { Accept: "application/json" },
    });
    if (!response.ok) {
      await response.body?.cancel();
      return resource === "transfer" && response.status === 404
        ? json({ error: "Reactor has not indexed this Prime transfer." }, 404)
        : json({ error: "Reactor is unavailable." }, 502);
    }
    if (!response.body) throw new Error("Missing response");
    const reader = response.body.getReader();
    let length = 0;
    const chunks: Uint8Array[] = [];
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        length += value.length;
        if (length > 65_536) throw new Error("Oversized response");
        chunks.push(value);
      }
    } finally { await reader.cancel(); reader.releaseLock(); }
    const bytes = new Uint8Array(length);
    let offset = 0;
    for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
    return json(JSON.parse(new TextDecoder().decode(bytes)));
  } catch {
    return json({ error: "Reactor is unavailable." }, 502);
  }
}
