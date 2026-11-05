import { Core } from "@blaze-cardano/sdk";
import { kernelSchemas } from "./schemas";

export type KernelFamily =
  "one-way" | "two-way" | "loans" | "options" | "aftermarket";
export type KernelValue =
  | string
  | bigint
  | KernelValue[]
  | { kind: string; fields: Record<string, KernelValue> };
interface Schema {
  $ref?: string;
  title?: string;
  dataType?: string;
  index?: number;
  fields?: Schema[];
  items?: Schema | Schema[];
  anyOf?: Schema[];
  keys?: Schema;
  values?: Schema;
}
const roots = {
  "one-way": "cardano_swaps/one_way_swap/types/SwapDatum",
  "two-way": "cardano_swaps/two_way_swap/types/SwapDatum",
  loans: "cardano_loans/data/datums/LoanDatum",
  options: "cardano_options/data/datums/OptionsDatum",
  aftermarket: "cardano_aftermarket/data/datums/MarketDatum",
};
function items(list: Core.PlutusList) {
  return Array.from({ length: list.getLength() }, (_, index) =>
    list.get(index),
  );
}
function decode(
  data: Core.PlutusData,
  schema: Schema,
  definitions: Record<string, Schema>,
  depth = 0,
): KernelValue {
  if (depth > 24)
    throw new Error("Kernel datum nesting exceeds supported depth.");
  if (schema.$ref) {
    const key = schema.$ref
      .replace("#/definitions/", "")
      .replaceAll("~1", "/")
      .replaceAll("~0", "~");
    const target = definitions[key];
    if (!target) throw new Error("Unknown Kernel datum type.");
    return decode(data, target, definitions, depth + 1);
  }
  if (schema.anyOf) {
    const constructor = data.asConstrPlutusData();
    const choice = schema.anyOf.find(
      (option) => BigInt(option.index!) === constructor?.getAlternative(),
    );
    if (!choice) throw new Error("Unsupported Kernel datum variant.");
    return decode(data, choice, definitions, depth + 1);
  }
  if (schema.dataType === "bytes") {
    const value = data.asBoundedBytes();
    if (!value || value.length > 64) throw new Error("Invalid Kernel bytes.");
    return Core.toHex(value);
  }
  if (schema.dataType === "integer") {
    const value = data.asInteger();
    if (value === undefined) throw new Error("Invalid Kernel integer.");
    return value;
  }
  if (schema.dataType === "constructor") {
    const constructor = data.asConstrPlutusData();
    if (!constructor || constructor.getAlternative() !== BigInt(schema.index!))
      throw new Error("Wrong Kernel constructor.");
    const values = items(constructor.getData());
    if (values.length !== (schema.fields?.length ?? 0))
      throw new Error("Unsupported Kernel field count.");
    return {
      kind: schema.title ?? "Constructor",
      fields: Object.fromEntries(
        (schema.fields ?? []).map((field, index) => [
          field.title ?? String(index),
          decode(values[index], field, definitions, depth + 1),
        ]),
      ),
    };
  }
  if (schema.dataType === "map") {
    const map = data.asMap();
    if (!map || !schema.keys || !schema.values)
      throw new Error("Invalid Kernel map.");
    const keys = items(map.getKeys()),
      seen = new Set<string>();
    return keys.map((key) => {
      const decodedKey = decode(key, schema.keys!, definitions, depth + 1);
      const encoded = JSON.stringify(decodedKey, (_, value) =>
        typeof value === "bigint" ? `bigint:${value}` : value,
      );
      if (seen.has(encoded)) throw new Error("Duplicate Kernel map key.");
      seen.add(encoded);
      const value = map.get(key);
      if (!value) throw new Error("Missing Kernel map value.");
      return [
        decodedKey,
        decode(value, schema.values!, definitions, depth + 1),
      ];
    });
  }
  if (schema.dataType === "list") {
    const list = data.asList();
    if (!list) throw new Error("Invalid Kernel list.");
    const values = items(list);
    if (Array.isArray(schema.items)) {
      if (values.length !== schema.items.length)
        throw new Error("Invalid Kernel tuple.");
      return values.map((value, index) =>
        decode(
          value,
          (schema.items as Schema[])[index],
          definitions,
          depth + 1,
        ),
      );
    }
    if (!schema.items) throw new Error("Missing Kernel item type.");
    return values.map((value) =>
      decode(value, schema.items as Schema, definitions, depth + 1),
    );
  }
  throw new Error("Unsupported Kernel datum encoding.");
}
export function decodeKernelDatum(family: KernelFamily, cbor: string) {
  if (
    cbor.length > 65536 ||
    !cbor.length ||
    cbor.length % 2 ||
    !/^[a-f\d]+$/i.test(cbor)
  )
    throw new Error("Invalid Kernel datum CBOR.");
  const reader = new Core.CborReader(Core.HexBlob(cbor));
  reader.readEncodedValue();
  if (reader.getBytesRemaining())
    throw new Error("Trailing Kernel datum bytes.");
  const definitions = kernelSchemas[
    family === "one-way" || family === "two-way" ? "swaps" : family
  ] as Record<string, Schema>;
  const value = decode(
    Core.PlutusData.fromCbor(Core.HexBlob(cbor)),
    definitions[roots[family]],
    definitions,
  );
  if (typeof value !== "object" || Array.isArray(value) || !("kind" in value))
    throw new Error("Expected Kernel record.");
  return value;
}
