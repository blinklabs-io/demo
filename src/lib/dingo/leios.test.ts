// @vitest-environment node
import { Core } from "@blaze-cardano/sdk";
import { expect, it } from "vitest";
import { decodeLeiosBlock, leiosTotals } from "./leios";
import { decodeHeaderVersion } from "./blockHeader";

function fixture({
  certified = false,
  certificate = certified,
  announcement = true,
  signatureBytes = 48,
  transactions = 0,
  extension = true,
}: { certified?: boolean; certificate?: boolean; announcement?: boolean; signatureBytes?: number; transactions?: number; extension?: boolean } = {}) {
  const hash32 = "5820" + "00".repeat(32);
  const body =
    (extension ? "8c" : "8a") +
    "0a14" +
    hash32.repeat(3) +
    "825840" +
    "00".repeat(64) +
    "5850" +
    "00".repeat(80) +
    "00" +
    hash32 +
    "845820" +
    "00".repeat(32) +
    "00005840" +
    "00".repeat(64) +
    "820c1845" +
    (extension
      ? (certified ? "f5" : "f4") +
        (announcement ? "825820" + "aa".repeat(32) + "1a00020000" : "f6")
      : "");
  const header = "82" + body + "5901c0" + "00".repeat(448);
  const cert = certificate
    ? "8241a058" +
      signatureBytes.toString(16).padStart(2, "0") +
      "00".repeat(signatureBytes)
    : "f6";
  const cbor =
    "82" + header + "83" + (transactions ? "81f6" : "80") + cert + "f6";
  return {
    bytes: Core.fromHex(cbor),
    expected: {
      hash: String(Core.blake2b_256(Core.HexBlob(header))),
      height: 10,
      slot: 20,
    },
  };
}

it("reads Dijkstra protocol versions from the extended native envelope", () => {
  const { bytes } = fixture();
  expect(decodeHeaderVersion(bytes)).toEqual({ major: "12", minor: "69" });
});
it("keeps announcements separate from certification and counts signer positions", () => {
  const { bytes, expected } = fixture({ certified: true });
  const row = decodeLeiosBlock(bytes, expected)!;
  expect(row).toMatchObject({
    certified: true,
    announcement: { hash: "aa".repeat(32), bytes: 131072 },
    certificate: { signerCount: 2, bitfieldBytes: 1, signatureBytes: 48 },
    rankingTransactions: 0,
  });
  expect(leiosTotals([row, row])).toEqual({
    announcements: 2,
    certificates: 2,
    announcedBytes: 262144,
  });
});
it("retains an absent announcement and a false certification flag", () => {
  const { bytes, expected } = fixture({ announcement: false });
  expect(decodeLeiosBlock(bytes, expected)).toMatchObject({
    certified: false,
    announcement: null,
    certificate: null,
  });
});
it("treats a Dijkstra header without the extension as absent optional data", () => {
  const { bytes, expected } = fixture({ extension: false });
  expect(decodeLeiosBlock(bytes, expected)).toBeNull();
});
it.each([
  { certified: true, certificate: false },
  { certified: false, certificate: true },
  { certified: true, transactions: 1 },
  { certified: true, signatureBytes: 47 },
])("rejects inconsistent or malformed certificates: %j", (options) => {
  const { bytes, expected } = fixture(options);
  expect(() => decodeLeiosBlock(bytes, expected)).toThrow();
});
it("verifies native header identity and indexed position", () => {
  const { bytes, expected } = fixture();
  expect(() =>
    decodeLeiosBlock(bytes, { ...expected, hash: "ff".repeat(32) }),
  ).toThrow(/does not match/);
  expect(() => decodeLeiosBlock(bytes, { ...expected, slot: 21 })).toThrow(
    /height or slot/,
  );
  expect(() => decodeLeiosBlock(bytes.slice(0, -1), expected)).toThrow();
});
