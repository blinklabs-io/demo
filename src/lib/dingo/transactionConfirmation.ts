import { blockfrostFetch, BlockfrostError } from "./blockfrost";

export class TransactionFailedError extends Error {}

export function isRetryableConfirmation(error: unknown): boolean {
  return Boolean(error) && !(error instanceof TransactionFailedError);
}

export async function readTransactionConfirmation(
  hash: string,
  signal?: AbortSignal,
) {
  try {
    const tx = await blockfrostFetch<{
      hash: string;
      block: string;
      valid_contract: boolean;
    }>(`/api/v0/txs/${hash}`, { signal });
    if (tx.hash !== hash || typeof tx.block !== "string" || !tx.block)
      throw new Error("Dingo returned an invalid transaction confirmation.");
    if (tx.valid_contract === false)
      throw new TransactionFailedError(
        "Transaction was included but failed script validation.",
      );
    if (tx.valid_contract !== true)
      throw new Error("Dingo did not verify the transaction as valid.");
    return tx;
  } catch (error) {
    if (error instanceof BlockfrostError && error.status === 404) return null;
    throw error;
  }
}
