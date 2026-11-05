// @vitest-environment node
import { expect, it } from "vitest";
import { readTransaction, transactionEnvelope } from "./studio";

const shared = "84a3008001800200a0f4f6";
const conway = "84a40080018002001601a0f5f6";
const babbage = "84a40080018002000682a000a0f5f6";
it("imports era-ambiguous raw bytes without claiming an original era", () => {
  const result = readTransaction(shared);
  expect(result).toMatchObject({
    cbor: shared,
    era: "ConwayEra",
    eraSource: "compatible",
    compatibleEras: ["ConwayEra", "BabbageEra"],
  });
  expect(result.encoded[2]).toBe("f4");
  expect(JSON.parse(transactionEnvelope(result))).toMatchObject({
    type: "Tx ConwayEra",
    cborHex: shared,
  });
});
it("recognizes Conway-only fields and rejects a conflicting envelope", () => {
  expect(readTransaction(conway)).toMatchObject({
    era: "ConwayEra",
    eraSource: "features",
    compatibleEras: ["ConwayEra"],
  });
  expect(() =>
    readTransaction(JSON.stringify({ type: "Tx BabbageEra", cborHex: conway })),
  ).toThrow(/after Babbage/);
});
it("recognizes legacy protocol updates as Babbage-only compatibility", () => {
  expect(readTransaction(babbage)).toMatchObject({
    era: "BabbageEra",
    eraSource: "features",
    compatibleEras: ["BabbageEra"],
  });
});
it("preserves a CLI envelope's era when its bytes are era-ambiguous", () => {
  const result = readTransaction(
    JSON.stringify({ type: "Tx BabbageEra", cborHex: shared }),
  );
  expect(result).toMatchObject({ era: "BabbageEra", eraSource: "envelope" });
  expect(JSON.parse(transactionEnvelope(result)).type).toBe("Tx BabbageEra");
});
it.each([
  shared + "00",
  "84a40080018002001700a0f5f6",
  "84a500800180020016010682a000a0f5f6",
])("does not loosen structural or era rejection: %s", (value) => {
  expect(() => readTransaction(value)).toThrow();
});
it("rejects Plutus V3 witnesses declared as Babbage", () => {
  const cbor = "84a3008001800200a107814101f5f6";
  expect(readTransaction(cbor)).toMatchObject({
    era: "ConwayEra",
    eraSource: "features",
  });
  expect(() => readTransaction(cbor, "BabbageEra")).toThrow(/witness fields/);
});

it.each([
  "84a300d901028001800200a0f5f6",
  "84a3008001800200a105a18200008200820000f5f6",
  "84a3008001800200a1058184040000820000f5f6",
])(
  "recognizes Conway set/redeemer encodings without rewriting them: %s",
  (cbor) => {
    const result = readTransaction(cbor);
    expect(result).toMatchObject({
      cbor,
      era: "ConwayEra",
      eraSource: "features",
    });
  },
);
it("rejects future redeemer purposes in both supported eras", () => {
  expect(() =>
    readTransaction("84a3008001800200a1058184060000820000f5f6"),
  ).toThrow(/redeemer purposes/);
});

it("classifies governance and removed genesis certificates by supported era", () => {
  const governance = `84a4008001800200048183078200581c${"11".repeat(28)}00a0f5f6`;
  const genesis = `84a400800180020004818405581c${"11".repeat(28)}581c${"22".repeat(28)}5820${"33".repeat(32)}a0f5f6`;
  expect(readTransaction(governance)).toMatchObject({
    era: "ConwayEra",
    eraSource: "features",
  });
  expect(readTransaction(genesis)).toMatchObject({
    era: "BabbageEra",
    eraSource: "features",
  });
});
