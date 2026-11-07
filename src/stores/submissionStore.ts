import { create } from "zustand";
import { DINGO_NETWORK } from "../lib/dingo/config";

export interface SubmissionReceipt {
  network: string;
  hash: string;
  submittedAt: number;
  validUntil?: number;
}

// Keep only public transaction identifiers and validity bounds for this tab's lifetime.
export const useSubmissionStore = create<{
  receipts: Map<string, SubmissionReceipt>;
  record: (hash: string, validUntil?: number) => void;
}>((set) => ({
  receipts: new Map(),
  record: (hash, validUntil) =>
    set((state) => {
      const receipts = new Map(state.receipts);
      receipts.set(hash, {
        hash,
        validUntil,
        network: DINGO_NETWORK.id,
        submittedAt: Date.now(),
      });
      if (receipts.size > 50) receipts.delete(receipts.keys().next().value!);
      return { receipts };
    }),
}));
