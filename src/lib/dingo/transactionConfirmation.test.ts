import { afterEach, expect, it, vi } from "vitest";
import {
  ConfirmationFailure,
  readTransactionConfirmation,
} from "./transactionConfirmation";
afterEach(() => vi.restoreAllMocks());
const hash = "11".repeat(32);
function respond(data: unknown, status = 200) {
  vi.spyOn(globalThis, "fetch").mockImplementation(
    async () =>
      new Response(JSON.stringify(data), {
        status,
        headers: { "Content-Type": "application/json" },
      }),
  );
}
it("treats a missing transaction as pending", async () => {
  respond({ message: "Not found" }, 404);
  expect(await readTransactionConfirmation(hash)).toBeNull();
});
it("confirms only an explicitly valid included transaction", async () => {
  respond({ hash, block: "22".repeat(32), valid_contract: true });
  expect(await readTransactionConfirmation(hash)).toMatchObject({
    hash,
    valid_contract: true,
  });
});
it("does not report an included failed-script transaction as confirmed success", async () => {
  respond({ hash, block: "22".repeat(32), valid_contract: false });
  await expect(readTransactionConfirmation(hash)).rejects.toThrow(
    "failed script validation",
  );
});
it.each([
  { hash, block: "22".repeat(32) },
  { hash: "33".repeat(32), block: "22".repeat(32), valid_contract: true },
  { hash, block: "", valid_contract: true },
  { hash, block: 123, valid_contract: true },
  { hash, block: "not-a-block-hash", valid_contract: true },
])(
  "does not substitute missing or mismatched confirmation evidence: %j",
  async (data) => {
    respond(data);
    await expect(readTransactionConfirmation(hash)).rejects.toThrow();
  },
);

it("retains included transaction failure identity as a terminal confirmation error", async () => {
  respond({ hash, block: "22".repeat(32), valid_contract: false });
  await expect(readTransactionConfirmation(hash)).rejects.toMatchObject({
    name: "ConfirmationFailure",
    txHash: hash,
    blockHash: "22".repeat(32),
  });
  await expect(readTransactionConfirmation(hash)).rejects.toBeInstanceOf(
    ConfirmationFailure,
  );
});
it("keeps temporary confirmation unavailability retryable rather than a ledger failure", async () => {
  respond({ message: "Temporarily unavailable" }, 503);
  await expect(readTransactionConfirmation(hash)).rejects.toMatchObject({
    status: 503,
  });
  await expect(readTransactionConfirmation(hash)).rejects.not.toBeInstanceOf(
    ConfirmationFailure,
  );
});
