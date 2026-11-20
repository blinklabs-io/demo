import { expect, it, vi } from "vitest";
import { nodeImplementation } from "./nodeImplementation";
vi.mock("./amaruPayloadDefinition.json", () => ({ default: {
  definition_format: 0, layout_version: { bits: [20, 21], layouts: {
    "0": { fields: [{ name: "release", type: "enum", bits: [0, 19], values: { "2": "v2" } }] },
    "1": { fields: [{ name: "ready", type: "boolean", bits: [0, 0] }] },
  } },
} }));
it("decodes a registry-linked conforming definition through the shared identity entry point", () => {
  expect(nodeImplementation("577")).toMatchObject({ id: "amaru", payloadSummary: "release: v2 (2)",
    decodedPayload: { kind: "decoded", layoutVersion: 0, fields: [{ name: "release", type: "enum", value: 2, label: "v2" }] } });
  expect(nodeImplementation(String(((1 << 20) | 1) * 256 + 65))).toMatchObject({ payloadSummary: "ready: true" });
  expect(nodeImplementation(String((3 << 20) * 256 + 65))).toMatchObject({ decodedPayload: { kind: "unknown-layout", layoutVersion: 3 }, detail: expect.stringContaining("unknown payload layout 3") });
  expect(nodeImplementation(String(0x40000041))).toMatchObject({ id: "unknown", signal: { kind: "unsupported", scheme: 1 } });
});
