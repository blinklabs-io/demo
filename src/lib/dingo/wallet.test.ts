// @vitest-environment node
import { describe, expect, it } from "vitest";
import { Core } from "@blaze-cardano/sdk";
import {
  drepIdForPublicKey,
  groupWalletUtxos,
  stakeAddressFor,
} from "./wallet";

const base = (payment: string, stake: string) =>
  Core.Address.fromBytes(
    Core.HexBlob(`00${payment.repeat(28)}${stake.repeat(28)}`),
  ).toBech32();
describe("wallet stake grouping", () => {
  it("groups base addresses by the actual stake credential", () => {
    expect(stakeAddressFor(base("11", "22"))).toBe(
      stakeAddressFor(base("33", "22")),
    );
    expect(stakeAddressFor(base("11", "22"))).not.toBe(
      stakeAddressFor(base("11", "44")),
    );
    const enterprise = Core.Address.fromBytes(
      Core.HexBlob(`60${"11".repeat(28)}`),
    ).toBech32();
    expect(stakeAddressFor(enterprise)).toBeUndefined();
  });
  it("preserves integer ADA totals, asset identities and output counts per address", () => {
    const result = groupWalletUtxos(
      [
        {
          address: "a",
          tx_hash: "1",
          output_index: 0,
          amount: [
            { unit: "lovelace", quantity: "9007199254740993" },
            { unit: "token", quantity: "2" },
          ],
        },
        {
          address: "a",
          tx_hash: "2",
          output_index: 0,
          amount: [
            { unit: "lovelace", quantity: "7" },
            { unit: "token", quantity: "3" },
          ],
        },
        {
          tx_hash: "3",
          output_index: 0,
          amount: [{ unit: "lovelace", quantity: "9" }],
        },
      ],
      "change",
    );
    expect(result[0]).toMatchObject({
      address: "a",
      lovelace: 9007199254741000n,
      utxoCount: 2,
    });
    expect([...result[0].assets]).toEqual(["token"]);
    expect(result[1]).toMatchObject({
      address: "change",
      lovelace: 9n,
      utxoCount: 1,
    });
  });
  it("derives a CIP-129 key DRep identifier from the wallet public key", () => {
    const id = drepIdForPublicKey("11".repeat(32));
    expect(Core.Cardano.DRepID.toCredential(id)).toMatchObject({
      type: Core.Cardano.CredentialType.KeyHash,
    });
  });
  it("rejects malformed DRep public keys", () => {
    expect(() => drepIdForPublicKey("not-a-key")).toThrow(
      "invalid DRep public key",
    );
  });
});
