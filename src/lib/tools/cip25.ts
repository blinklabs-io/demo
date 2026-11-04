import type { Core } from "@blaze-cardano/sdk";
export interface Cip25File {
  name: string;
  mediaType: string;
  src: string;
  properties?: string;
}
export interface Cip25Draft {
  displayName: string;
  artwork: "generated" | "uri";
  image: string;
  mediaType: string;
  files: Cip25File[];
  properties: string;
}
export const emptyCip25: Cip25Draft = {
  displayName: "",
  artwork: "generated",
  image: "",
  mediaType: "",
  files: [],
  properties: "{}",
};
const encoder = new TextEncoder();
const reserved = new Set([
  "name",
  "image",
  "mediaType",
  "description",
  "files",
]);
type Datum = Core.Cardano.Metadatum;
function chunks(text: string): string | string[] {
  if (encoder.encode(text).length <= 64) return text;
  const result: string[] = [];
  let current = "";
  for (const char of text) {
    if (encoder.encode(current + char).length > 64) {
      result.push(current);
      current = "";
    }
    current += char;
  }
  if (current) result.push(current);
  return result;
}
function short(text: string, label: string) {
  if (!text.trim() || encoder.encode(text).length > 64)
    throw new Error(`${label} must contain 1–64 UTF-8 bytes.`);
  return text;
}
function uri(text: string, label: string, image = false) {
  if (!text || /\s/.test(text))
    throw new Error(`${label} must be a complete URI without spaces.`);
  let url: URL;
  try {
    url = new URL(text);
  } catch {
    throw new Error(`${label} needs an HTTPS, IPFS, Arweave or data URI.`);
  }
  if (
    !["https:", "http:", "ipfs:", "ar:", "data:"].includes(url.protocol) ||
    url.username ||
    url.password
  )
    throw new Error(`${label} uses an unsupported URI scheme.`);
  if (url.protocol === "data:") {
    try {
      atob(text.slice(text.indexOf(",") + 1));
    } catch {
      throw new Error(`${label} contains invalid base64.`);
    }
    if (
      !/^data:[\w.+-]+\/[\w.+-]+(?:;[\w.+-]+=[^;,]+)*;base64,[A-Za-z0-9+/]+={0,2}$/i.test(
        text,
      ) ||
      (image && !/^data:image\//i.test(text))
    )
      throw new Error(
        `${label} needs a valid base64 data URI${image ? " for an image" : ""}.`,
      );
  } else if (!url.hostname)
    throw new Error(`${label} must identify a resource.`);
  return text;
}
export function tokenArtwork(name: string) {
  const initials = [...name]
    .slice(0, 2)
    .join("")
    .replace(
      /[&<>"']/g,
      (c) =>
        ({
          "&": "&amp;",
          "<": "&lt;",
          ">": "&gt;",
          '"': "&quot;",
          "'": "&apos;",
        })[c]!,
    );
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="256" height="256" viewBox="0 0 256 256"><rect width="256" height="256" rx="56" fill="#0c1b26"/><circle cx="128" cy="128" r="94" fill="#174d40" stroke="#53d4b4" stroke-width="4"/><text x="128" y="149" text-anchor="middle" font-family="sans-serif" font-size="64" font-weight="bold" fill="#96f6d7">${initials}</text></svg>`;
  return `data:image/svg+xml;base64,${btoa(String.fromCharCode(...encoder.encode(svg)))}`;
}
function record(value: unknown, label: string): Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value))
    throw new Error(`${label} must be a JSON object.`);
  return value as Record<string, unknown>;
}
function custom(value: unknown, path: string, depth = 0): Datum {
  if (depth > 8)
    throw new Error("Custom properties may be at most 8 levels deep.");
  if (typeof value === "string") {
    if (encoder.encode(value).length > 64)
      throw new Error(
        `${path}: custom text values must fit 64 UTF-8 bytes; use an explicit array of chunks.`,
      );
    return value;
  }
  if (typeof value === "number" && Number.isSafeInteger(value))
    return BigInt(value);
  if (Array.isArray(value))
    return value.map((v, i) => custom(v, `${path}[${i}]`, depth + 1));
  if (value !== null && typeof value === "object")
    return new Map(
      Object.entries(value).map(([k, v]) => [
        short(k, `${path} key`),
        custom(v, `${path}.${k}`, depth + 1),
      ]),
    );
  throw new Error(
    `${path}: use text, safe integers, arrays or objects; booleans, null and fractional/unsafe numbers are not transaction metadata.`,
  );
}
export function buildCip25(
  assetName: string,
  description: string,
  draft: Cip25Draft = emptyCip25,
): Map<Datum, Datum> {
  if (encoder.encode(description).length > 512)
    throw new Error("Description is limited to 512 UTF-8 bytes.");
  if (encoder.encode(draft.properties).length > 8192)
    throw new Error("Custom properties exceed 8 KiB.");
  const properties = record(JSON.parse(draft.properties), "Custom properties");
  const result = new Map<Datum, Datum>();
  for (const [k, v] of Object.entries(properties)) {
    if (reserved.has(k))
      throw new Error(
        `Set ${k} using its metadata field, not custom properties.`,
      );
    result.set(short(k, "Property key"), custom(v, k));
  }
  result.set("name", short(draft.displayName || assetName, "Display name"));
  result.set(
    "image",
    chunks(
      draft.artwork === "generated"
        ? tokenArtwork(draft.displayName || assetName)
        : uri(draft.image, "Image", true),
    ),
  );
  const mediaType =
    draft.artwork === "generated" ? "image/svg+xml" : draft.mediaType;
  if (mediaType) {
    if (!/^image\/[a-z0-9.+-]+$/i.test(mediaType))
      throw new Error("Image media type must be image/*.");
    result.set("mediaType", short(mediaType, "Image media type"));
  }
  if (description) result.set("description", chunks(description));
  if (draft.files.length > 8) throw new Error("Add at most 8 attached files.");
  if (draft.files.length)
    result.set(
      "files",
      draft.files.map((f, i) => {
        if (!/^[a-z0-9.+-]+\/[a-z0-9.+-]+$/i.test(f.mediaType))
          throw new Error(`File ${i + 1} needs a MIME media type.`);
        if (new TextEncoder().encode(f.properties || "{}").length > 8192)
          throw new Error(`File ${i + 1} properties exceed 8 KiB.`);
        const extras = record(
          JSON.parse(f.properties || "{}"),
          `File ${i + 1} properties`,
        );
        const file = new Map<Datum, Datum>();
        for (const [k, v] of Object.entries(extras)) {
          if (["name", "mediaType", "src"].includes(k))
            throw new Error(`Set file ${k} using its field.`);
          file.set(
            short(k, "File property key"),
            custom(v, `File ${i + 1}.${k}`),
          );
        }
        file.set("name", short(f.name, `File ${i + 1} name`));
        file.set("mediaType", short(f.mediaType, `File ${i + 1} media type`));
        file.set("src", chunks(uri(f.src, `File ${i + 1} source`)));
        return file;
      }),
    );
  if (encoder.encode(metadataJson(result)).length > 8192)
    throw new Error(
      "Asset metadata exceeds 8 KiB. Shorten fields or use published media URIs.",
    );
  return result;
}
export function metadataJson(value: Datum, depth = 0): string {
  const pad = "  ".repeat(depth),
    next = pad + "  ";
  if (value instanceof Map)
    return value.size
      ? `{\n${[...value].map(([k, v]) => `${next}${JSON.stringify(String(k))}: ${metadataJson(v, depth + 1)}`).join(",\n")}\n${pad}}`
      : "{}";
  if (Array.isArray(value))
    return value.length
      ? `[\n${value.map((v) => next + metadataJson(v, depth + 1)).join(",\n")}\n${pad}]`
      : "[]";
  if (typeof value === "bigint") return value.toString();
  return JSON.stringify(value);
}
function text(value: unknown, label: string) {
  if (typeof value === "string") return value;
  if (Array.isArray(value) && value.every((v) => typeof v === "string"))
    return value.join("");
  throw new Error(`${label} must be text or an array of text chunks.`);
}
export function importCip25(raw: string): {
  draft: Cip25Draft;
  description: string;
} {
  if (encoder.encode(raw).length > 32768)
    throw new Error("Metadata import exceeds 32 KiB.");
  const data = record(JSON.parse(raw), "Per-asset metadata");
  const files = data.files === undefined ? [] : data.files;
  if (!Array.isArray(files)) throw new Error("Files must be an array.");
  const draft: Cip25Draft = {
    displayName: text(data.name, "Name"),
    artwork: "uri",
    image: text(data.image, "Image"),
    mediaType:
      data.mediaType === undefined ? "" : text(data.mediaType, "Media type"),
    files: files.map((value, i) => {
      const f = record(value, `File ${i + 1}`);
      return {
        name: f.name === undefined ? "" : text(f.name, "File name"),
        mediaType: text(f.mediaType, "File media type"),
        src: text(f.src, "File source"),
        properties: JSON.stringify(
          Object.fromEntries(
            Object.entries(f).filter(
              ([k]) => !["name", "mediaType", "src"].includes(k),
            ),
          ),
          null,
          2,
        ),
      };
    }),
    properties: JSON.stringify(
      Object.fromEntries(
        Object.entries(data).filter(([k]) => !reserved.has(k)),
      ),
      null,
      2,
    ),
  };
  const description =
    data.description === undefined ? "" : text(data.description, "Description");
  buildCip25(draft.displayName, description, draft);
  return { draft, description };
}
