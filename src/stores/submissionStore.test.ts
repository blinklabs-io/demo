import { expect, it } from "vitest";
import { useSubmissionStore } from "./submissionStore";

it("retains recent resubmissions when the receipt limit evicts an older transaction", () => {
  useSubmissionStore.setState({ receipts: new Map() });
  const hash = (i: number) => i.toString(16).padStart(64, "0");
  for (let i = 0; i < 50; i++) useSubmissionStore.getState().record(hash(i));
  useSubmissionStore.getState().record(hash(0), 1000);
  useSubmissionStore.getState().record(hash(50));
  const receipts = useSubmissionStore.getState().receipts;
  expect(receipts.size).toBe(50);
  expect(receipts.get(hash(0))?.validUntil).toBe(1000);
  expect(receipts.has(hash(1))).toBe(false);
});
