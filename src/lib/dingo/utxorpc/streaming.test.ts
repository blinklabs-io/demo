// @vitest-environment node
import { Core } from "@blaze-cardano/sdk";
import { expect, it } from "vitest";
import { decodeMempoolTx } from "./streaming";

it("retains actual input outpoints and output amounts for the mempool web", () => {
  const body = new Core.TransactionBody(Core.CborSet.fromCore([{ txId: Core.TransactionId("11".repeat(32)), index: 2 }], Core.TransactionInput.fromCore), [new Core.TransactionOutput(Core.addressFromCredential(0, Core.Credential.fromCore({ hash: Core.Hash28ByteBase16("00".repeat(28)), type: Core.CredentialType.KeyHash })), new Core.Value(1234567n))], 200000n);
  const transaction = new Core.Transaction(body, new Core.TransactionWitnessSet());
  const decoded = decodeMempoolTx(Core.fromHex(transaction.toCbor()));
  expect(decoded?.inputs).toEqual([{ hash: "11".repeat(32), index: 2 }]);
  expect(decoded?.outputs).toEqual([{ address: body.outputs()[0].address().toBech32(), lovelace: 1234567n }]);
  expect(decoded?.fee).toBe(200000n);
});
