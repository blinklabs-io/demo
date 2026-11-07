// @vitest-environment node
import { Core } from "@blaze-cardano/sdk";
import { expect, it } from "vitest";
import { decodeMempoolTx } from "./streaming";

it("retains actual input outpoints and output amounts for the mempool web", () => {
  const address = Core.addressFromCredential(0, Core.Credential.fromCore({
    hash: Core.Hash28ByteBase16("00".repeat(28)), type: Core.CredentialType.KeyHash,
  }));
  const inputs = Core.CborSet.fromCore([
    { txId: Core.TransactionId("11".repeat(32)), index: 2 },
  ], Core.TransactionInput.fromCore);
  const unit = Core.AssetId("33".repeat(28) + "544f4b");
  const output = new Core.TransactionOutput(address, new Core.Value(1234567n, new Map([[unit, 42n]])));
  const body = new Core.TransactionBody(inputs, [output], 200000n);
  const transaction = new Core.Transaction(body, new Core.TransactionWitnessSet());
  const decoded = decodeMempoolTx(Core.fromHex(transaction.toCbor()));
  expect(decoded?.inputs).toEqual([{ hash: "11".repeat(32), index: 2 }]);
  expect(decoded?.outputs).toEqual([{ address: address.toBech32(), lovelace: 1234567n, assets: [{ unit, quantity: 42n }] }]);
  expect(decoded?.fee).toBe(200000n);
});
