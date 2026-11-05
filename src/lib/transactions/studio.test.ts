// @vitest-environment node
import { Core } from "@blaze-cardano/sdk";
import { getDingoProvider } from "../dingo/utxorpc/provider";
import type { Cip30WalletApi } from "../dingo/cip30";
import { expect, it, vi } from "vitest";
import {
  addWalletWitness,
  readTransaction,
  transactionEnvelope,
} from "./studio";

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
  [shared + "00", /Unexpected data after the transaction/],
  ["84a40080018002001700a0f5f6", /unsupported body fields/],
  ["84a500800180020016010682a000a0f5f6", /Legacy protocol updates/],
])("rejects invalid transaction %s", (value, message) => {
  expect(() => readTransaction(value)).toThrow(message);
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
it("checks nested pool-owner set tags when inferring era compatibility", () => {
  const registration = (tag: string) =>
    `84a400800180020004818a03581c${"11".repeat(28)}5820${"22".repeat(32)}0000d81e820001581de0${"33".repeat(28)}${tag}81581c${"44".repeat(28)}80f6a0f5f6`;
  expect(readTransaction(registration(""))).toMatchObject({
    eraSource: "compatible",
  });
  const tagged = registration("d90102");
  expect(readTransaction(tagged)).toMatchObject({
    era: "ConwayEra",
    eraSource: "features",
  });
  expect(() =>
    readTransaction(JSON.stringify({ type: "Tx BabbageEra", cborHex: tagged })),
  ).toThrow(/pool-owner/);
});

it.each([false, true])(
  "preserves bytes and era provenance through an actual wallet witness merge (envelope=%s)",
  async (envelope) => {
    await Core.initCrypto();
    const key = Core.Ed25519PrivateKey.fromNormalHex(
      Core.Ed25519PrivateNormalKeyHex("55".repeat(32)),
    );
    const address = Core.addressFromCredential(
      0,
      Core.Credential.fromCore({
        type: Core.CredentialType.KeyHash,
        hash: key.toPublic().hash().hex(),
      }),
    );
    const input = new Core.TransactionInput(
      Core.TransactionId("66".repeat(32)),
      0n,
    );
    const output = new Core.TransactionUnspentOutput(
      input,
      new Core.TransactionOutput(address, new Core.Value(10000000n)),
    );
    const body = `a30081825820${"66".repeat(32)}0001800200`;
    const raw = `84${body}a0f4f6`;
    const original = readTransaction(
      envelope ? JSON.stringify({ type: "Tx BabbageEra", cborHex: raw }) : raw,
    );
    const provider = getDingoProvider();
    const genesis = vi
      .spyOn(provider.queryClient, "readGenesis")
      .mockResolvedValue({ networkMagic: 2 } as Awaited<
        ReturnType<typeof provider.queryClient.readGenesis>
      >);
    const resolve = vi
      .spyOn(provider, "resolveUnspentOutputs")
      .mockResolvedValue([output]);
    try {
      const api = {
        getNetworkId: async () => 0,
        signTx: async () => {
          const witness = new Core.TransactionWitnessSet();
          witness.setVkeys(
            Core.CborSet.fromCore(
              [
                [
                  key.toPublic().hex(),
                  key.sign(Core.HexBlob(original.id)).hex(),
                ],
              ],
              Core.VkeyWitness.fromCore,
            ),
          );
          return witness.toCbor();
        },
      } as unknown as Cip30WalletApi;
      const signed = await addWalletWitness(original, api, () => {});
      expect(signed.encoded[0]).toBe(body);
      expect(signed.encoded.slice(2)).toEqual(["f4", "f6"]);
      expect(signed.id).toBe(original.id);
      expect(signed.tx.witnessSet().vkeys()?.size()).toBe(1);
      expect(signed).toMatchObject(
        envelope
          ? { era: "BabbageEra", eraSource: "envelope" }
          : { era: "ConwayEra", eraSource: "features" },
      );
      expect(JSON.parse(transactionEnvelope(signed)).type).toBe(
        envelope ? "Tx BabbageEra" : "Tx ConwayEra",
      );
    } finally {
      genesis.mockRestore();
      resolve.mockRestore();
    }
  },
);
