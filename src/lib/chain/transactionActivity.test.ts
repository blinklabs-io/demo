// @vitest-environment node
import { Core } from "@blaze-cardano/sdk";
import { expect, it } from "vitest";
import { transactionActivity } from "./transactionActivity";
import { inspectChainTransaction, transactionKind } from "../explorer/transaction";

const mintBody = `a400800180020009a1581c${"11".repeat(28)}a1414101`;
const scriptWitness = "a1058184000000820000";
function mintTransaction() {
  return Core.Transaction.fromCbor(Core.TxCBOR(`84${mintBody}${scriptWitness}f5f6`));
}
it("uses the same asset activity for a scripted mint in mosaic and details", () => {
  const tx = mintTransaction();
  expect(transactionActivity(tx)).toBe("mint");
  expect(transactionKind(inspectChainTransaction(tx.toCbor(), String(tx.getId())))).toBe("Asset creation & burn");
});
it("identifies governance certificates before generic script execution", () => {
  const core = mintTransaction().toCore();
  core.body.certificates = [{
    __typename: Core.CertificateType.RegisterDelegateRepresentative,
    dRepCredential: {type: Core.CredentialType.KeyHash, hash: Core.Hash28ByteBase16("22".repeat(28))},
    deposit: 500000000n,
    anchor: null,
  }];
  expect(transactionActivity(Core.Transaction.fromCore(core))).toBe("governance");
});
it("keeps failed validation distinct from unapplied minting intent", () => {
  const core = mintTransaction().toCore();
  core.isValid = false;
  expect(transactionActivity(Core.Transaction.fromCore(core))).toBe("failed");
});
