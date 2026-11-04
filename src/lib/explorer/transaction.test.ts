// @vitest-environment node
import { describe, expect, it } from "vitest";
import { Core } from "@blaze-cardano/sdk";
import {
  inspectChainTransaction,
  readChainTransactionEnvelope,
} from "./transaction";

const body = "a3008001800200";
const witnesses = "a0";
const auxiliary = "a1016161";

describe("transaction envelopes", () => {
  it("preserves the false script-validity flag and auxiliary bytes independently", () => {
    const cbor = `84${body}${witnesses}f4${auxiliary}`;
    expect(readChainTransactionEnvelope(cbor)).toEqual({
      bodyCbor: body,
      witnessCbor: witnesses,
      auxiliaryCbor: auxiliary,
      validity: false,
      bodyBytes: body.length / 2,
      witnessBytes: witnesses.length / 2,
    });
    const tx = Core.Transaction.fromCbor(Core.TxCBOR(cbor));
    expect(inspectChainTransaction(cbor, String(tx.getId())).tx.isValid()).toBe(
      false,
    );
  });

  it("accepts three-item envelopes without mistaking auxiliary data for validity", () => {
    expect(
      readChainTransactionEnvelope(`83${body}${witnesses}${auxiliary}`),
    ).toMatchObject({
      validity: true,
      auxiliaryCbor: auxiliary,
    });
  });

  it("rejects trailing bytes even when the body hash still matches", () => {
    const cbor = `84${body}${witnesses}f5f6`;
    const hash = String(Core.Transaction.fromCbor(Core.TxCBOR(cbor)).getId());
    expect(inspectChainTransaction(cbor, hash).totalBytes).toBe(
      cbor.length / 2,
    );
    expect(() => inspectChainTransaction(`${cbor}00`, hash)).toThrow(
      /after the transaction envelope/,
    );
  });

  it.each([
    `85${body}${witnesses}f5f600`,
    `84${body}${witnesses}00f6`,
    `84${body}${witnesses}f5`,
    `82${body}${witnesses}`,
  ])("rejects incomplete, oversized and misaligned frames: %s", (cbor) => {
    expect(() => readChainTransactionEnvelope(cbor)).toThrow();
  });
});
