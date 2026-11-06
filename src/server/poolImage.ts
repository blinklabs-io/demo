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
  const matches = (offset: number, ...prefix: number[]) =>
    prefix.every((b, i) => bytes[offset + i] === b);
  if (matches(0, 137, 80, 78, 71, 13, 10, 26, 10)) return "image/png";
  if (matches(0, 255, 216, 255)) return "image/jpeg";
  if (
    matches(0, 71, 73, 70, 56) &&
    [55, 57].includes(bytes[4]) &&
    bytes[5] === 97
  )
    return "image/gif";
  if (matches(0, 82, 73, 70, 70) && matches(8, 87, 69, 66, 80))
    return "image/webp";
  const text = new TextDecoder().decode(bytes);
  let cursor = 0;
  const nonSpace = /\S/g;
  const skipSpace = () => {
    nonSpace.lastIndex = cursor;
    cursor = nonSpace.exec(text)?.index ?? text.length;
  };
  skipSpace();
  if (text.startsWith("<?xml", cursor)) {
    const end = text.indexOf("?>", cursor + 5);
    if (end < 0) throw new Error("Image");
    cursor = end + 2;
    skipSpace();
  }
  while (text.startsWith("<!--", cursor)) {
    const end = text.indexOf("-->", cursor + 4);
    if (end < 0) throw new Error("Image");
    cursor = end + 3;
    skipSpace();
  }
  if (text.slice(cursor, cursor + 9).toUpperCase() === "<!DOCTYPE") {
    const end = text.indexOf(">", cursor + 9);
    if (end < 0) throw new Error("Image");
    const declaration = text.slice(cursor, end + 1);
    if (
      !/^<!DOCTYPE\s+svg(?:\s|>)/i.test(declaration) ||
      declaration.includes("[") ||
      declaration.includes("]") ||
      declaration.includes("<", 1)
    )
      throw new Error("Image");
    cursor = end + 1;
    skipSpace();
  }
  if (/^<svg[\s>]/i.test(text.slice(cursor, cursor + 5)))
    return "image/svg+xml";
  throw new Error("Image");
}

export async function poolImage(request: Request): Promise<Response> {
  const endpoint = new URL(request.url);
  const params = endpoint.searchParams;
  const hash = params.get("hash");
  const offset = Number(params.get("offset") ?? "0");
  let url: URL;
  try {
    url = publicUrl(params.get("url"));
    if (!hash || !/^[a-f\d]{64}$/i.test(hash)) throw new Error("Hash");
    if (!Number.isInteger(offset) || offset < 0 || offset >= 10)
      throw new Error("Offset");
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
    const extended = doc.extDataUrl ?? doc.extended;
    const seen = new Set<string>();
    let profile = doc;
    let base = primary.url;
    let index = 0;
    for (let stage = 0; stage < 2; stage++) {
      for (const candidate of images(profile, base).slice(0, 5)) {
        if (seen.has(candidate.href)) continue;
        seen.add(candidate.href);
        const current = index++;
        if (current < offset) continue;
        try {
          const image = await read(
            candidate,
            signal,
            2_097_152,
            endpoint.origin,
          );
          const type = imageType(image.bytes);
          return new Response(image.bytes, {
            headers: {
              "Content-Type": type,
              "Cache-Control": "public, max-age=3600",
              "X-Content-Type-Options": "nosniff",
              "Content-Security-Policy":
                "sandbox; default-src 'none'; style-src 'unsafe-inline'; frame-ancestors 'none'",
              "Referrer-Policy": "no-referrer",
              "X-Pool-Image-Next": String(index),
            },
          });
        } catch {
          signal.throwIfAborted();
        }
      }
      if (stage === 1 || !extended) break;
      const result = await read(
        publicUrl(extended, primary.url),
        signal,
        1_048_576,
        endpoint.origin,
      );
      profile = document(result.bytes);
      base = result.url;
    }
  } catch {
    // Do not relay upstream error bodies or redirect visitors to pool servers.
  }
  return new Response("Pool image unavailable", {
    status: 404,
    headers: { "Cache-Control": "no-store" },
  });
}
