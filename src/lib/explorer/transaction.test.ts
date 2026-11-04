// @vitest-environment node
import { describe, expect, it } from "vitest";
import { Core } from "@blaze-cardano/sdk";
import {
  inspectChainTransaction,
  transactionKind,
  readChainTransactionEnvelope,
} from "./transaction";

const body = "a3008001800200";
const witnesses = "a0";
const auxiliary = "a1016161";

function metadataBody() {
  const decoded = Core.TransactionBody.fromCbor(Core.HexBlob(body));
  decoded.setAuxiliaryDataHash(Core.blake2b_256(Core.HexBlob(auxiliary)));
  return decoded.toCbor();
}

describe("transaction envelopes", () => {
  it("preserves the false script-validity flag and auxiliary bytes independently", () => {
    const cbor = `84${metadataBody()}${witnesses}f4${auxiliary}`;
    expect(readChainTransactionEnvelope(cbor)).toEqual({
      bodyCbor: metadataBody(),
      witnessCbor: witnesses,
      auxiliaryCbor: auxiliary,
      validity: false,
      bodyBytes: metadataBody().length / 2,
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

const credential = {
  type: Core.CredentialType.KeyHash,
  hash: Core.Hash28ByteBase16("11".repeat(28)),
};
type Certificate = Parameters<typeof Core.Certificate.fromCore>[0];
const governanceCertificates: Certificate[] = [
  {
    __typename: Core.CertificateType.RegisterDelegateRepresentative,
    dRepCredential: credential,
    deposit: 500000000n,
    anchor: null,
  },
  {
    __typename: Core.CertificateType.UnregisterDelegateRepresentative,
    dRepCredential: credential,
    deposit: 500000000n,
  },
  {
    __typename: Core.CertificateType.UpdateDelegateRepresentative,
    dRepCredential: credential,
    anchor: null,
  },
  {
    __typename: Core.CertificateType.AuthorizeCommitteeHot,
    coldCredential: credential,
    hotCredential: credential,
  },
  {
    __typename: Core.CertificateType.ResignCommitteeCold,
    coldCredential: credential,
    anchor: null,
  },
  {
    __typename: Core.CertificateType.VoteDelegation,
    stakeCredential: credential,
    dRep: { __typename: "AlwaysAbstain" },
  },
];

function certificateInspection(certificate: Certificate) {
  const core = Core.Transaction.fromCbor(
    Core.TxCBOR(`84${body}${witnesses}f5f6`),
  ).toCore();
  core.body.certificates = [certificate];
  const tx = Core.Transaction.fromCore(core);
  return inspectChainTransaction(tx.toCbor(), String(tx.getId()));
}

describe("transaction activity classification", () => {
  it.each(governanceCertificates)(
    "identifies $__typename without requiring a vote or proposal",
    (certificate) => {
      expect(transactionKind(certificateInspection(certificate))).toBe(
        "Governance",
      );
    },
  );
  it("keeps ordinary stake registration distinct from governance", () => {
    expect(
      transactionKind(
        certificateInspection({
          __typename: Core.CertificateType.StakeRegistration,
          stakeCredential: credential,
        }),
      ),
    ).toBe("Stake & identity");
  });
});

it("authenticates metadata bytes against the body commitment", () => {
  const cbor = `84${metadataBody()}${witnesses}f5${auxiliary}`;
  const hash = String(Core.Transaction.fromCbor(Core.TxCBOR(cbor)).getId());
  expect(inspectChainTransaction(cbor, hash).metadata).toEqual([[1n, "a"]]);
  for (const data of ["a1016162", "f6"]) {
    expect(() =>
      inspectChainTransaction(`84${metadataBody()}${witnesses}f5${data}`, hash),
    ).toThrow(/auxiliary data/);
  }
  const uncommitted = `84${body}${witnesses}f5${auxiliary}`;
  const uncommittedHash = String(
    Core.Transaction.fromCbor(Core.TxCBOR(uncommitted)).getId(),
  );
  expect(() => inspectChainTransaction(uncommitted, uncommittedHash)).toThrow(
    /auxiliary data/,
  );
});

it("fully inspects three-item envelopes with committed metadata", () => {
  const cbor = `83${metadataBody()}${witnesses}${auxiliary}`;
  const hash = String(Core.Transaction.fromCbor(Core.TxCBOR(cbor)).getId());
  const result = inspectChainTransaction(cbor, hash);
  expect(result.metadata).toEqual([[1n, "a"]]);
  expect(result.tx.isValid()).toBe(true);
  expect(result.totalBytes).toBe(cbor.length / 2);
});

it("rejects a complete envelope above the decoding size limit", () => {
  const large = `5a00020000${"00".repeat(131072)}`;
  expect(() =>
    readChainTransactionEnvelope(`84${body}${witnesses}f5${large}`),
  ).toThrow(/invalid or oversized/);
});

it("rejects a body with a different requested transaction ID", () => {
  expect(() =>
    inspectChainTransaction(`84${body}${witnesses}f5f6`, "00".repeat(32)),
  ).toThrow(/requested transaction ID/);
});
