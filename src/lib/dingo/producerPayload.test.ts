import { expect, it } from "vitest";
import { decodeProducerPayload } from "./producerPayload";
import amaru from "./amaruPayloadDefinition.json";

const flat = { definition_format: 0, fields: [
  { name: "release", type: "enum", bits: [0, 3], values: { "1": "v1" } },
  { name: "ready", type: "boolean", bits: [4, 4] },
  { name: "counter", type: "integer", bits: [5, 21] },
] };
const versioned = { definition_format: 0, layout_version: {
  bits: [20, 21], layouts: { "0": { fields: flat.fields.slice(0, 2) }, "1": { fields: [
    { name: "major", type: "integer", bits: [0, 5] },
    { name: "p2p", type: "boolean", bits: [19, 19] },
  ] } },
} };
it("decodes integer, boolean and enum fields across the entire 22-bit payload", () => {
  expect(decodeProducerPayload(0x3ffff1, flat)).toEqual({ kind: "decoded", fields: [
    { name: "release", type: "enum", value: 1, label: "v1" },
    { name: "ready", type: "boolean", value: true },
    { name: "counter", type: "integer", value: 131071 },
  ] });
  expect(decodeProducerPayload(0, flat)).toEqual({ kind: "decoded", fields: [
    { name: "release", type: "enum", value: 0 },
    { name: "ready", type: "boolean", value: false },
    { name: "counter", type: "integer", value: 0 },
  ] });
});
it("selects layouts and preserves unknown enum and layout numbers", () => {
  expect(decodeProducerPayload((1 << 20) | (1 << 19) | 42, versioned)).toEqual({ kind: "decoded", layoutVersion: 1, fields: [
    { name: "major", type: "integer", value: 42 }, { name: "p2p", type: "boolean", value: true },
  ] });
  expect(decodeProducerPayload(15, versioned)).toMatchObject({ kind: "decoded", layoutVersion: 0, fields: [{ name: "release", value: 15 }, { name: "ready", value: false }] });
  expect(decodeProducerPayload(3 << 20, versioned)).toEqual({ kind: "unknown-layout", layoutVersion: 3 });
});
it.each([
  null, {},
  { ...flat, extra: true },
  { ...flat, layout_version: versioned.layout_version },
  { ...flat, fields: [] },
  { ...flat, fields: [{ name: "x", type: "integer", bits: [4, 3] }] },
  { ...flat, fields: [{ name: "x", type: "integer", bits: [0, 22] }] },
  { ...flat, fields: [{ name: "x", type: "integer", bits: [0.5, 2] }] },
  { ...flat, fields: [{ name: "x", type: "boolean", bits: [0, 1] }] },
  { ...flat, fields: [{ name: "id", type: "integer", bits: [0, 1] }] },
  { ...flat, fields: [{ name: "", type: "integer", bits: [0, 1] }] },
  { ...flat, fields: [{ name: "x", type: "other", bits: [0, 1] }] },
  { ...flat, fields: [{ name: "x", type: "integer", bits: [0, 1], values: {} }] },
  { ...flat, fields: [{ name: "x", type: "enum", bits: [0, 1], values: { "4": "too wide" } }] },
  { ...flat, fields: [{ name: "x", type: "enum", bits: [0, 1], values: { "01": "noncanonical" } }] },
  { ...flat, fields: [{ name: "x", type: "enum", bits: [0, 1], values: { "0": 5 } }] },
  { ...flat, fields: [{ name: "x", type: "integer", bits: [0, 1] }, { name: "y", type: "integer", bits: [1, 2] }] },
  { ...flat, fields: [{ name: "x", type: "integer", bits: [0, 1] }, { name: "x", type: "integer", bits: [2, 3] }] },
  { definition_format: 0, layout_version: { bits: [0, 1], layouts: { "0": { fields: [{ name: "x", type: "integer", bits: [1, 2] }] } } } },
  { definition_format: 0, layout_version: { bits: [20, 21], layouts: { "4": { fields: flat.fields } } } },
])("does not interpret a missing or nonconforming definition %#", source => {
  expect(decodeProducerPayload(1234, source).kind).toBe("opaque");
});
it("decodes the current registry-linked Amaru definition", () => {
  expect(decodeProducerPayload(64, amaru)).toEqual({
    kind: "decoded",
    layoutVersion: 0,
    fields: [
      { name: "days_since_amaru_epoch", type: "integer", value: 1 },
      { name: "flags", type: "integer", value: 0 },
    ],
  });
});
it("does not guess unsupported definition formats or reject unknown producer bits", () => {
  expect(decodeProducerPayload(0, { ...flat, definition_format: 1 })).toEqual({ kind: "opaque", reason: "unsupported-format" });
  expect(decodeProducerPayload(1 << 19, { definition_format: 0, fields: [flat.fields[0]] })).toEqual({ kind: "decoded", fields: [{ name: "release", type: "enum", value: 0 }] });
});

it("matches the CIP-0203 published example across historical layouts", () => {
  const source = { definition_format: 0, layout_version: { bits: [20, 21], layouts: {
    "0": { fields: [{ name: "release", type: "enum", bits: [0, 19], values: { "1": "1.0.0", "2": "1.1.0" } }] },
    "1": { fields: [
      { name: "releaseMajor", type: "integer", bits: [14, 19] },
      { name: "releaseMinor", type: "integer", bits: [8, 13] },
      { name: "releasePatch", type: "integer", bits: [2, 7] },
      { name: "hardForkReady", type: "boolean", bits: [1, 1] },
      { name: "p2p", type: "boolean", bits: [0, 0] },
    ] },
  } } };
  expect(decodeProducerPayload(1213193, source)).toEqual({ kind: "decoded", layoutVersion: 1, fields: [
    { name: "releaseMajor", type: "integer", value: 10 },
    { name: "releaseMinor", type: "integer", value: 3 },
    { name: "releasePatch", type: "integer", value: 2 },
    { name: "hardForkReady", type: "boolean", value: false },
    { name: "p2p", type: "boolean", value: true },
  ] });
  expect(decodeProducerPayload(2, source)).toEqual({ kind: "decoded", layoutVersion: 0, fields: [{ name: "release", type: "enum", value: 2, label: "1.1.0" }] });
});
