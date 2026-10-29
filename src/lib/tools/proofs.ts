import { Core } from "@blaze-cardano/sdk";
import { blockfrostFetch } from "../dingo/blockfrost";

export async function fileDigest(file: File) {
  if (file.size > 32 * 1024 * 1024)
    throw new Error("Choose a file up to 32 MiB.");
  return Core.sha2_256(
    Core.HexBlob.fromBytes(new Uint8Array(await file.arrayBuffer())),
  );
}
export async function verifyDocumentProof(hash: string, digest: string) {
  if (!/^[a-f0-9]{64}$/i.test(hash))
    throw new Error("Enter a 64-character transaction hash.");
  if (!/^[a-f0-9]{64}$/.test(digest))
    throw new Error("Choose the file to verify first.");
  hash = hash.toLowerCase();
  const [raw, summary] = await Promise.all([
    blockfrostFetch<{ cbor: string }>(`/api/v0/txs/${hash}/cbor`),
    blockfrostFetch<{
      hash: string;
      block: string;
      valid_contract: boolean;
      block_time: number;
    }>(`/api/v0/txs/${hash}`),
  ]);
  const tx = Core.Transaction.fromCbor(Core.TxCBOR(raw.cbor));
  if (
    tx.getId() !== hash.toLowerCase() ||
    summary.hash !== tx.getId() ||
    !summary.block ||
    summary.valid_contract !== true
  )
    throw new Error("Dingo did not return a valid confirmed transaction.");
  if (!Number.isSafeInteger(summary.block_time) || summary.block_time < 0)
    throw new Error("Dingo returned an invalid block timestamp.");
  const auxiliary = tx.auxiliaryData();
  if (
    !auxiliary ||
    Core.blake2b_256(auxiliary.toCbor()) !== tx.body().auxiliaryDataHash()
  )
    throw new Error("Transaction metadata failed its integrity check.");
  const payload = auxiliary.metadata()?.toCore().get(674n);
  const proof = payload instanceof Map ? payload.get("proof") : undefined;
  if (
    !(proof instanceof Map) ||
    proof.get("algorithm") !== "SHA-256" ||
    proof.get("hash") !== digest
  )
    throw new Error(
      "This transaction does not contain a matching SHA-256 document proof.",
    );
  return { hash: tx.getId(), time: summary.block_time };
}
