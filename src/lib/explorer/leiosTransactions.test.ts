// @vitest-environment node
import { Core } from "@blaze-cardano/sdk";
import { expect, it } from "vitest";
import { decodeLeiosTransaction } from "./leiosTransactions";

const body = "a300800180021a00030d40";
const hash = Core.blake2b_256(Core.HexBlob(body));
it.each(["f5", "f4"])("reads native Dijkstra transaction sizes, fees, and final validity %s", (flag) => {
  const cbor = `84${body}a0f6${flag}`;
  expect(decodeLeiosTransaction({ tx_hash: hash, cbor })).toEqual({ hash, bytes: cbor.length / 2, fee: 200000n, valid: flag === "f5" });
});
it("rejects a mismatched body hash", () => {
  expect(() => decodeLeiosTransaction({ tx_hash: "11".repeat(32), cbor: `84${body}a0f6f5` })).toThrow(/does not match/);
});
it.each([`84${body}a0f5f6`, `84${body}a0f6f500`, "8300", "xyz"])("rejects malformed and legacy envelopes: %s", (cbor) => {
  expect(() => decodeLeiosTransaction({ tx_hash: hash, cbor })).toThrow();
});
