import { expect, it } from "vitest";
import { decodeProducerSignal, nodeImplementation } from "./nodeImplementation";

it.each([
  ["0", 0, 0],
  ["7", 7, 0],
  ["67", 67, 0],
  ["69", 69, 0],
  ["315973", 69, 1234],
  ["1073741637", 69, 4194303],
  ["1073741823", 255, 4194303],
])("decodes CIP-203 vector %s", (minor, implementationId, payload) => {
  expect(decodeProducerSignal(minor)).toEqual({
    kind: "cip203",
    scheme: 0,
    implementationId,
    payload,
  });
});
it.each([1, 2, 3])("does not decode reserved scheme %s as Dingo", (scheme) => {
  const minor = String((BigInt(scheme) << 30n) | 69n);
  expect(decodeProducerSignal(minor)).toEqual({ kind: "unsupported", scheme });
  expect(nodeImplementation(minor).id).toBe("unknown");
});
it.each(["4294967296", "-1", "1.5", "", "NaN", "99999999999999999999"])(
  "rejects invalid uint32 %s",
  (minor) => {
    expect(decodeProducerSignal(minor)).toEqual({ kind: "invalid" });
  },
);
it("recognizes payload-bearing Dingo without inventing a software version", () => {
  expect(nodeImplementation("315973")).toMatchObject({
    id: "dingo",
    detail: expect.stringContaining("opaque payload 1234"),
  });
});
it("keeps historical IDs, legacy markers, opt-outs and unknown identifiers distinct", () => {
  expect(nodeImplementation("65").id).toBe("amaru");
  expect(nodeImplementation(String((1234 << 8) | 65)).id).toBe("amaru");
  expect(nodeImplementation("42")).toMatchObject({
    id: "gerolamo",
    name: "Gerolamo",
    registration: "historical",
  });
  expect(nodeImplementation("0").name).toContain("assumed");
  expect(nodeImplementation("1").name).toBe("Haskell cardano-node");
  expect(nodeImplementation("2").name).toBe("Haskell cardano-node");
  expect(nodeImplementation("7").name).toBe("Haskell cardano-node");
  expect(nodeImplementation("255")).toMatchObject({
    id: "unknown",
    name: "Identity withheld",
  });
  expect(nodeImplementation("99").name).toBe("Unregistered implementation 99");
  expect(nodeImplementation("257").id).toBe("unknown");
});
it("resolves the current registry while preserving historical identities", () => {
  expect(nodeImplementation("79")).toMatchObject({ id: "tsunagi", name: "TSUNAGI", registration: "active", decodedPayload: { kind: "opaque", reason: "absent" } });
  expect(nodeImplementation("65")).toMatchObject({ id: "amaru", registration: "active", decodedPayload: { kind: "decoded", layoutVersion: 0, fields: [{ name: "days_since_amaru_epoch", value: 0 }, { name: "flags", value: 0 }] } });
  expect(nodeImplementation("67")).toMatchObject({ id: "cardano-bean", name: "Bean", registration: "active" });
  expect(nodeImplementation("73")).toMatchObject({ id: "scarab", name: "Scarab", registration: "active" });
  expect(nodeImplementation("69")).toMatchObject({ id: "dingo", registration: "historical" });
  expect(nodeImplementation("42")).toMatchObject({ id: "gerolamo", name: "Gerolamo", registration: "historical" });
});
it("decodes Amaru payloads with the current registry-linked definition", () => {
  expect(nodeImplementation(String((64 << 8) + 65))).toMatchObject({
    id: "amaru",
    payloadSummary: "days_since_amaru_epoch: 1 · flags: 0",
    decodedPayload: { kind: "decoded", layoutVersion: 0, fields: [
      { name: "days_since_amaru_epoch", value: 1 },
      { name: "flags", value: 0 },
    ] },
  });
});
