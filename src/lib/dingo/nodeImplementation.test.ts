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
it("keeps legacy markers, ambiguous IDs, opt-outs and unknown identifiers distinct", () => {
  expect(nodeImplementation("65").id).toBe("amaru");
  expect(nodeImplementation(String((1234 << 8) | 65)).id).toBe("amaru");
  expect(nodeImplementation("67").name).toBe("Gerolamo / cardano-bean");
  expect(nodeImplementation(String((1234 << 8) | 67)).name).toBe(
    "Gerolamo / cardano-bean",
  );
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
it.each([
  ["65", "Unreleased build"],
  ["2637889", "Release 2026-06-11"],
  ["4374593", "Release 2026-09-25"],
  ["4374849", "Release 2026-09-25"],
  [String(0x0042ff41), "Release 2026-09-25"],
  ["268419137", "Release 2070-11-09"],
  [String(0x1042c041), "Unknown payload layout 1"],
])("deciphers Amaru payload vector %s", (minor, release) => {
  expect(nodeImplementation(minor)).toMatchObject({ id: "amaru", release });
});
