import { Core } from "@blaze-cardano/sdk";
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
  return { document, bytes, url: response.url || url };
}

function images(document: Record<string, unknown>, base: string) {
  const info = object(document.info);
  const media = object(object(document.pool)?.media_assets);
  return [
    media?.icon_png_64x64,
    info?.url_png_icon_64x64,
    media?.logo_png,
    info?.url_png_logo,
    media?.logo_svg,
  ]
    .map((value) => documentUrl(value, base))
    .filter((url): url is string => url !== null);
}

export interface PoolSocialLink {
  label: string;
  url: string;
}
function extendedProfile(document: Record<string, unknown>) {
  const info = object(document.info),
    pool = object(document.pool);
  if (!info && !pool)
    throw new Error("Extended metadata has no recognized pool or info object.");
  for (const value of [
    info?.social,
    info?.about,
    pool?.contact,
    pool?.media_assets,
  ]) {
    if (value !== undefined && !object(value))
      throw new Error("Extended metadata contains malformed profile fields.");
  }
  const social = { ...object(pool?.contact), ...object(info?.social) };
  const links: PoolSocialLink[] = [];
  for (const [label, keys, base] of [
    ["X / Twitter", ["twitter_handle", "twitter"], "https://x.com/"],
    ["GitHub", ["github_handle", "github"], "https://github.com/"],
    ["Telegram", ["telegram_handle", "telegram"], "https://t.me/"],
    ["Discord", ["discord"], "https://discord.gg/"],
    ["Facebook", ["facebook"], "https://www.facebook.com/"],
    ["YouTube", ["youtube"], "https://www.youtube.com/@"],
  ] as const) {
    const value = keys
      .map((key) => social[key])
      .find((value) => typeof value === "string" && value.trim());
    if (typeof value !== "string") continue;
    const direct = documentUrl(value);
    const handle = value.trim().replace(/^@/, "");
    const url =
      direct ??
      (/^[a-zA-Z0-9_.-]+$/.test(handle)
        ? base + encodeURIComponent(handle)
        : null);
    if (url) links.push({ label, url });
  }
  const about = object(info?.about);
  const fields = [
    ["About", about?.me],
    ["Infrastructure", about?.server],
    ["Organization", about?.company],
    ["Country", pool?.country],
    ["Status", pool?.status],
  ].filter(
    (field): field is [string, string] =>
      typeof field[1] === "string" && Boolean(field[1].trim()),
  );
  return { links, fields };
}

export async function readPoolProfile(
  metadataUrl: string,
  metadataHash: string,
  signal: AbortSignal,
) {
  const url = documentUrl(metadataUrl);
  if (!url) throw new Error("Pool metadata URL must use HTTP or HTTPS.");
  if (!/^[a-f0-9]{64}$/i.test(metadataHash))
    throw new Error("A registered metadata hash is required.");
  const bounded = AbortSignal.any([signal, AbortSignal.timeout(10_000)]);
  const metadata = await readDocument(url, bounded);
  if (
    String(Core.blake2b_256(Core.HexBlob.fromBytes(metadata.bytes))) !==
    metadataHash.toLowerCase()
  )
    throw new Error("Owner metadata does not match the registered hash.");
  const direct = images(metadata.document, metadata.url);
  const extendedUrl =
    documentUrl(metadata.document.extDataUrl, metadata.url) ??
    documentUrl(metadata.document.extended, metadata.url);
  if (!extendedUrl || direct.length > 0)
    return {
      metadata: metadata.document,
      extended: null,
      extendedUrl,
      logos: [...new Set(direct)],
      links: [] as PoolSocialLink[],
      fields: [] as [string, string][],
    };
  const extended = await readExtendedPoolProfile(extendedUrl, bounded);
  return { metadata: metadata.document, ...extended };
}

export async function readExtendedPoolProfile(
  url: string,
  signal: AbortSignal,
) {
  const safeUrl = documentUrl(url);
  if (!safeUrl)
    throw new Error("Extended metadata URL must use HTTP or HTTPS.");
  const bounded = AbortSignal.any([signal, AbortSignal.timeout(10_000)]);
  const extended = await readDocument(safeUrl, bounded);
  const presentation = extendedProfile(extended.document);
  return {
    extended: extended.document,
    extendedUrl: extended.url,
    logos: [...new Set(images(extended.document, extended.url))],
    ...presentation,
  };
}
