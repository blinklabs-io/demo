// @vitest-environment node
import { Core } from "@blaze-cardano/sdk";
import { expect, it } from "vitest";
import {
  decodePlutusData,
  transactionDataItems,
  inputDataItems,
} from "./plutusWorkbench";

it("decodes constructors, bytes, lists and large signed integers without precision loss", () => {
  expect(decodePlutusData("d8799f182a4568656c6c6fff").tree).toEqual({
    constructor: "0",
    fields: [{ int: "42" }, { bytes: "68656c6c6f" }],
  });
  expect(
    decodePlutusData("821bffffffffffffffff3bffffffffffffffff").tree,
  ).toEqual({
    list: [{ int: "18446744073709551615" }, { int: "-18446744073709551616" }],
  });
  expect(decodePlutusData("a1014200ff").tree).toEqual({
    map: [{ k: { int: "1" }, v: { bytes: "00ff" } }],
  });
  expect(decodePlutusData("d8799f182a4568656c6c6fff").hash).toBe(
    "abf1684c343b2004e7f40510a12c2428adfaedabad1c05cae9ff4c08ba82ae0a",
  );
  expect(decodePlutusData("00").tree).toEqual({ int: "0" });
  expect(decodePlutusData("40").tree).toEqual({ bytes: "" });
});

it.each(["", "0", "zz", "0001", "f5", "6161", "d8799f", "00".repeat(65537)])(
  "rejects malformed, trailing or non-data CBOR",
  (cbor) => {
    expect(() => decodePlutusData(cbor)).toThrow();
  },
);

it("limits nested structures without crashing the page", () => {
  expect(() => decodePlutusData("81".repeat(66) + "00")).toThrow(/limit/);
});

it("links spending redeemers to ledger-ordered inputs rather than wire order", () => {
  const tx = Core.Transaction.fromCbor(
    Core.TxCBOR(
      "84a30082825820" +
        "22".repeat(32) +
        "01825820" +
        "11".repeat(32) +
        "0001800200a1058184000000820102f5f6",
    ),
  );
  const items = transactionDataItems(tx.toCbor(), String(tx.getId()));
  expect(items).toContainEqual(
    expect.objectContaining({
      label: "Spend redeemer #0",
      sourceHash: "11".repeat(32),
      outputIndex: 0,
      cbor: "00",
    }),
  );
  expect(() => transactionDataItems(tx.toCbor(), "33".repeat(32))).toThrow(
    /does not match/,
  );
});

it("retains reference-input context separately from spent inputs", () => {
  expect(
    inputDataItems([
      {
        address: "addr_test",
        output_index: 2,
        amount: [],
        collateral: false,
        reference: true,
        inline_datum: "00",
        tx_hash: "11".repeat(32),
        reference_script_hash: "22".repeat(28),
      },
    ]),
  ).toEqual([
    expect.objectContaining({
      sourceHash: "11".repeat(32),
      scriptHash: "22".repeat(28),
      context: "Read by the transaction; not spent.",
      cbor: "00",
    }),
  ]);
});

it("preserves repeated map keys and their distinct encoded values", () => {
  expect(decodePlutusData("a201020103").tree).toEqual({
    map: [
      { k: { int: "1" }, v: { int: "2" } },
      { k: { int: "1" }, v: { int: "3" } },
    ],
  });
});
