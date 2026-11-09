import { createFluidPool, type FluidTerms } from "./data";
import { Core } from "@blaze-cardano/sdk";
export function fluidRpcOutput(item: { nativeBytes: string; txoRef: { hash: string; index: number } }) {
  const bytes = (value: string) => Uint8Array.from(atob(value), c => c.charCodeAt(0));
  return new Core.TransactionUnspentOutput(new Core.TransactionInput(Core.TransactionId(Core.toHex(bytes(item.txoRef.hash))), BigInt(item.txoRef.index)), Core.TransactionOutput.fromCbor(Core.HexBlob.fromBytes(bytes(item.nativeBytes))));
}

export const fluidFixtureTerms: FluidTerms = {principal:"lovelace",collateral:"33".repeat(28)+"01",amount:100000000n,collateralAmount:1000000n,principalRatio:1000000n,interest:1000n,hours:720,repaymentWindow:24,extraAda:0n};
export function fluidPoolFixture(index = 0) {
  const owner=Core.addressFromCredentials(1,Core.Credential.fromCore({type:Core.CredentialType.KeyHash,hash:Core.Hash28ByteBase16("11".repeat(28))}),Core.Credential.fromCore({type:Core.CredentialType.KeyHash,hash:Core.Hash28ByteBase16((index?"44":"22").repeat(28))}));
  const seed=new Core.TransactionInput(Core.TransactionId("aa".repeat(32)),BigInt(index));
  const {output}=createFluidPool(fluidFixtureTerms,owner,seed);
  return new Core.TransactionUnspentOutput(new Core.TransactionInput(Core.TransactionId((index?"bb":"cc").repeat(32)),0n),output);
}
