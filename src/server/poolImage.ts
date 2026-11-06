import { blake2bHex } from "blakejs";

function publicUrl(value: unknown, base?: string): URL {
  if (typeof value !== "string" || value.length > 2048) throw new Error("URL");
  const url = new URL(value, base);
  const host = url.hostname.toLowerCase().replace(/\.$/, "");
  if (
    !["http:", "https:"].includes(url.protocol) ||
    url.username ||
    url.password ||
    url.port ||
    !host.includes(".") ||
    /^[\d.]+$/.test(host) ||
    host.includes(":") ||
    /(?:^|\.)(?:localhost|local|internal|test|invalid|example)$/.test(host)
  )
    throw new Error("URL");
  url.hash = "";
  return url;
}

function object(value: unknown): Record<string, unknown> | undefined {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}

async function read(
  url: URL,
  signal: AbortSignal,
  limit: number,
  origin: string,
) {
  // Cloudflare's public fetch network is the DNS/private-address boundary.
  // Keep this server handler in Pages Functions, outside the browser and Vite.
  for (let redirects = 0; redirects <= 3; redirects++) {
    if (url.origin === origin) throw new Error("Recursive");
    const response = await fetch(url, {
      signal,
      redirect: "manual",
      credentials: "omit",
      headers: { Accept: "application/json,image/*;q=0.9" },
    });
    if ([301, 302, 303, 307, 308].includes(response.status)) {
      await response.body?.cancel();
      url = publicUrl(response.headers.get("location"), url.href);
      continue;
    }
    if (!response.ok || !response.body) {
      await response.body?.cancel();
      throw new Error("Upstream");
    }
    const reader = response.body.getReader();
    const chunks: Uint8Array[] = [];
    let length = 0;
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        length += value.length;
        if (length > limit) throw new Error("Size");
        chunks.push(value);
      }
    } finally {
      await reader.cancel();
      reader.releaseLock();
    }
    const bytes = new Uint8Array(length);
    let offset = 0;
    for (const chunk of chunks) {
      bytes.set(chunk, offset);
      offset += chunk.length;
    }
    return { bytes, url: url.href };
  }
  throw new Error("Redirects");
}

function document(bytes: Uint8Array) {
  const result = object(JSON.parse(new TextDecoder().decode(bytes)));
  if (!result) throw new Error("Document");
  return result;
}

function images(doc: Record<string, unknown>, base: string) {
  const info = object(doc.info);
  const media = object(object(doc.pool)?.media_assets);
  return [
    media?.icon_png_64x64,
    info?.url_png_icon_64x64,
    media?.logo_png,
    info?.url_png_logo,
    media?.logo_svg,
  ].flatMap((value) => {
    try {
      return [publicUrl(value, base)];
    } catch {
      return [];
    }
  });
}

function imageType(bytes: Uint8Array): string {
  const starts = (...prefix: number[]) =>
    prefix.every((b, i) => bytes[i] === b);
  if (starts(137, 80, 78, 71, 13, 10, 26, 10)) return "image/png";
  if (starts(255, 216, 255)) return "image/jpeg";
  const text = new TextDecoder().decode(bytes);
  if (/^GIF8[79]a/.test(text)) return "image/gif";
  if (/^RIFF[\s\S]{4}WEBP/.test(text)) return "image/webp";
  if (/^\s*(?:<\?xml[^>]*>\s*)?(?:<!--[\s\S]*?-->\s*)*<svg[\s>]/i.test(text))
    return "image/svg+xml";
  throw new Error("Image");
}

export async function poolImage(request: Request): Promise<Response> {
  const endpoint = new URL(request.url);
  const params = endpoint.searchParams;
  const hash = params.get("hash");
  let url: URL;
  try {
    url = publicUrl(params.get("url"));
    if (!hash || !/^[a-f\d]{64}$/i.test(hash)) throw new Error("Hash");
    if (url.origin === endpoint.origin) throw new Error("Recursive");
  } catch {
    return new Response("Invalid pool metadata reference", { status: 400 });
  }
  const signal = AbortSignal.any([request.signal, AbortSignal.timeout(10_000)]);
  try {
    const primary = await read(url, signal, 1_048_576, endpoint.origin);
    if (blake2bHex(primary.bytes, undefined, 32) !== hash!.toLowerCase())
      throw new Error("Hash");
    const doc = document(primary.bytes);
    const candidates = images(doc, primary.url);
    const extended = doc.extDataUrl ?? doc.extended;
    if (extended && candidates.length === 0) {
      const result = await read(
        publicUrl(extended, primary.url),
        signal,
        1_048_576,
        endpoint.origin,
      );
      candidates.push(...images(document(result.bytes), result.url));
    }
    for (const candidate of [
      ...new Map(candidates.map((u) => [u.href, u])).values(),
    ].slice(0, 5)) {
      try {
        const image = await read(candidate, signal, 2_097_152, endpoint.origin);
        const type = imageType(image.bytes);
        return new Response(image.bytes, {
          headers: {
            "Content-Type": type,
            "Cache-Control": "public, max-age=3600",
            "X-Content-Type-Options": "nosniff",
            "Content-Security-Policy":
              "sandbox; default-src 'none'; style-src 'unsafe-inline'; frame-ancestors 'none'",
            "Referrer-Policy": "no-referrer",
          },
        });
      } catch {
        signal.throwIfAborted();
      }
    }
  } catch {
    // Do not relay upstream error bodies or redirect visitors to pool servers.
  }
  return new Response("Pool image unavailable", {
    status: 404,
    headers: { "Cache-Control": "no-store" },
  });
}
