type Bits = [number, number];
type Field = {
  name: string;
  type: "integer" | "boolean" | "enum";
  bits: Bits;
  values?: Record<string, string>;
};
type Layout = { fields: Field[] };
type Definition = {
  definition_format: 0;
  fields?: Field[];
  layout_version?: { bits: Bits; layouts: Record<string, Layout> };
};
export type DecodedProducerPayload =
  | { kind: "opaque"; reason: "absent" | "unsupported-format" | "invalid-definition" }
  | { kind: "unknown-layout"; layoutVersion: number }
  | {
      kind: "decoded";
      layoutVersion?: number;
      fields: {
        name: string;
        type: Field["type"];
        value: number | boolean;
        label?: string;
      }[];
    };

function object(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
function keys(value: Record<string, unknown>, required: string[], optional: string[] = []) {
  return required.every(key => Object.hasOwn(value, key)) &&
    Object.keys(value).every(key => required.includes(key) || optional.includes(key));
}
function bits(value: unknown): value is Bits {
  return Array.isArray(value) && value.length === 2 &&
    value.every(n => Number.isInteger(n) && n >= 0 && n <= 21) &&
    value[0] <= value[1];
}
function mask(range: Bits) {
  return (2 ** (range[1] - range[0] + 1) - 1) * 2 ** range[0];
}
function extract(payload: number, range: Bits) {
  return Math.floor(payload / 2 ** range[0]) % 2 ** (range[1] - range[0] + 1);
}
function values(value: unknown, range: Bits): value is Record<string, unknown> {
  return object(value) && Object.keys(value).length > 0 &&
    Object.keys(value).every(key => /^(0|[1-9]\d*)$/.test(key) &&
      Number(key) < 2 ** (range[1] - range[0] + 1));
}
function fields(value: unknown, occupied = 0): value is Field[] {
  if (!Array.isArray(value) || !value.length || value.length > 22) return false;
  const names = new Set<string>();
  for (const field of value) {
    if (!object(field) || typeof field.name !== "string" || !field.name ||
      ["name", "id", "scheme", "definition_format"].includes(field.name) ||
      names.has(field.name) || !bits(field.bits)) return false;
    if (!keys(field, ["name", "type", "bits"], field.type === "enum" ? ["values"] : [])) return false;
    if (field.type === "boolean") {
      if (field.bits[0] !== field.bits[1]) return false;
    } else if (field.type === "enum") {
      if (!values(field.values, field.bits) ||
        !Object.values(field.values).every(value => typeof value === "string")) return false;
    } else if (field.type !== "integer") return false;
    const used = mask(field.bits);
    if ((occupied & used) !== 0) return false;
    occupied |= used;
    names.add(field.name);
  }
  return true;
}
function definition(value: unknown): value is Definition {
  if (!object(value) || value.definition_format !== 0 ||
    !keys(value, ["definition_format"], ["fields", "layout_version"])) return false;
  if (Object.hasOwn(value, "fields") === Object.hasOwn(value, "layout_version")) return false;
  if (Object.hasOwn(value, "fields")) return fields(value.fields);
  const selector = value.layout_version;
  if (!object(selector) || !keys(selector, ["bits", "layouts"]) ||
    !bits(selector.bits) || !values(selector.layouts, selector.bits)) return false;
  const occupied = mask(selector.bits);
  return Object.values(selector.layouts).every(layout => object(layout) &&
    keys(layout, ["fields"]) && fields(layout.fields, occupied));
}

export function decodeProducerPayload(payload: number, source?: unknown): DecodedProducerPayload {
  if (source === undefined || source === null) return { kind: "opaque", reason: "absent" };
  if (object(source) && Number.isInteger(source.definition_format) && Number(source.definition_format) > 0) {
    return { kind: "opaque", reason: "unsupported-format" };
  }
  if (!Number.isInteger(payload) || payload < 0 || payload > 0x3fffff || !definition(source)) {
    return { kind: "opaque", reason: "invalid-definition" };
  }
  const layoutVersion = source.layout_version ? extract(payload, source.layout_version.bits) : undefined;
  const selected = layoutVersion === undefined ? source.fields! :
    source.layout_version!.layouts[String(layoutVersion)]?.fields;
  if (!selected) return { kind: "unknown-layout", layoutVersion: layoutVersion! };
  return {
    kind: "decoded",
    ...(layoutVersion === undefined ? {} : { layoutVersion }),
    fields: selected.map(field => {
      const value = extract(payload, field.bits);
      return {
        name: field.name,
        type: field.type,
        value: field.type === "boolean" ? Boolean(value) : value,
        ...(field.type === "enum" && Object.hasOwn(field.values!, String(value))
          ? { label: field.values![String(value)] } : {}),
      };
    }),
  };
}
