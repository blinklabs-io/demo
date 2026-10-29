function documentUrl(value: unknown, base?: string): string | null {
  if (typeof value !== "string" || !value.trim()) return null;
  try {
    const url = new URL(value, base);
    return (url.protocol === "https:" || url.protocol === "http:") &&
      !url.username &&
      !url.password
      ? url.href
      : null;
  } catch {
    return null;
  }
}

function object(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

async function readDocument(url: string, signal: AbortSignal) {
  const response = await fetch(url, {
    signal,
    credentials: "omit",
    referrerPolicy: "no-referrer",
  });
  if (!response.ok)
    throw new Error(`Pool metadata returned ${response.status}.`);
  if (!response.body) throw new Error("Pool metadata is empty.");
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let length = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      length += value.byteLength;
      if (length > 1_048_576) throw new Error("Pool metadata exceeds 1 MiB.");
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
  const document = object(JSON.parse(new TextDecoder().decode(bytes)));
  if (!document) throw new Error("Pool metadata must be a JSON object.");
  return { document, url: response.url || url };
}

function images(document: Record<string, unknown>, base: string) {
  const info = object(document.info);
  return [info?.url_png_icon_64x64, info?.url_png_logo]
    .map((value) => documentUrl(value, base))
    .filter((url): url is string => url !== null);
}

export async function readPoolLogos(metadataUrl: string, signal: AbortSignal) {
  const url = documentUrl(metadataUrl);
  if (!url) throw new Error("Pool metadata URL must use HTTP or HTTPS.");
  const bounded = AbortSignal.any([signal, AbortSignal.timeout(10_000)]);
  const metadata = await readDocument(url, bounded);
  const direct = images(metadata.document, metadata.url);
  if (direct.length) return [...new Set(direct)];
  const extendedUrl = documentUrl(metadata.document.extended, metadata.url);
  if (!extendedUrl) return [...new Set(direct)];
  const extended = await readDocument(extendedUrl, bounded);
  return [...new Set(images(extended.document, extended.url))];
}
