// @vitest-environment node
import { Core } from "@blaze-cardano/sdk";
import { expect, it } from "vitest";
import { transactionActivity } from "./transactionActivity";
import { inspectChainTransaction, transactionKind } from "../explorer/transaction";

const mintScript = new Core.PlutusV2Script(Core.HexBlob("0100002221200101"));
const mintBody = `a400800180020009a1581c${mintScript.hash()}a1414101`;
const scriptWitness = `a20581840100008200000681${mintScript.toCbor()}`;
function mintTransaction() {
  return Core.Transaction.fromCbor(Core.TxCBOR(`84${mintBody}${scriptWitness}f5f6`));
}
it("classifies an encoded scripted mint consistently with transaction details", () => {
  const tx = mintTransaction();
  expect(tx.witnessSet().redeemers()!.values()[0].tag()).toBe(Core.RedeemerTag.Mint);
  expect(tx.witnessSet().plutusV2Scripts()!.values()[0].hash()).toBe(mintScript.hash());
  expect([...tx.body().mint()!.keys()][0].slice(0, 56)).toBe(mintScript.hash());
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
