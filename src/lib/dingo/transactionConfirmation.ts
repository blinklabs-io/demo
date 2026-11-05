import { blockfrostFetch, BlockfrostError } from "./blockfrost";

export class ConfirmationFailure extends Error {
  readonly txHash: string;
  readonly blockHash: string;
  constructor(txHash: string, blockHash: string) {
    super(
      "Transaction was included but failed script validation. Its intended actions were not applied.",
    );
    this.name = "ConfirmationFailure";
    this.txHash = txHash;
    this.blockHash = blockHash;
  }
}
export async function readTransactionConfirmation(
  hash: string,
  signal?: AbortSignal,
) {
  if (!/^[0-9a-f]{64}$/i.test(hash))
    throw new Error("Invalid transaction confirmation hash.");
  try {
    const tx = await blockfrostFetch<{
      hash?: unknown;
      block?: unknown;
      valid_contract?: unknown;
    }>(`/api/v0/txs/${hash}`, { signal });
    if (
      tx?.hash !== hash ||
      typeof tx.block !== "string" ||
      !/^[0-9a-f]{64}$/i.test(tx.block)
    )
      throw new Error("Dingo returned an invalid transaction confirmation.");
    if (tx.valid_contract === false)
      throw new ConfirmationFailure(hash, tx.block);
    if (tx.valid_contract !== true)
      throw new Error("Dingo did not verify the transaction as valid.");
    return { hash, block: tx.block, valid_contract: true as const };
  } catch (error) {
    if (error instanceof BlockfrostError && error.status === 404) return null;
    throw error;
  }
}
