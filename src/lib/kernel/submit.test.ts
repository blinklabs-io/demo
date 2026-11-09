// @vitest-environment node
import { Core } from "@blaze-cardano/sdk";
import { beforeEach, expect, it, vi } from "vitest";
import { submitKernelTransaction, type KernelDraft } from "./transactions";
import type { Cip30WalletApi } from "../dingo/cip30";
const boundary = vi.hoisted(() => ({
  tip: 100,
  fetch: vi.fn(),
  post: vi.fn(),
  sign: vi.fn(),
}));
vi.mock("../dingo/config", () => ({
  DINGO_NETWORK: { id: "preprod", label: "Preprod", networkMagic: 1 },
}));
vi.mock("../dingo/blockfrost", () => ({ blockfrostFetch: boundary.fetch }));
vi.mock("../dingo/walletSession", () => ({
  assertDingoTransactionBackends: async () => {},
  assertWalletSession: async (_api: unknown, guard: () => void) => guard(),
  assertTransactionNetwork: async (_tx: unknown, guard: () => void) => guard(),
}));
beforeEach(() => {
  vi.clearAllMocks();
  boundary.tip = 100;
  boundary.fetch.mockImplementation(async () => ({ slot: boundary.tip }));
  boundary.post.mockImplementation(async (tx: Core.Transaction) => tx.getId());
});
function fixture() {
  const address = Core.addressFromCredential(
    0,
    Core.Credential.fromCore({
      type: Core.CredentialType.KeyHash,
      hash: Core.Hash28ByteBase16("11".repeat(28)),
    }),
  );
  const body = new Core.TransactionBody(
    Core.CborSet.fromCore([], Core.TransactionInput.fromCore),
    [new Core.TransactionOutput(address, new Core.Value(5000000n))],
    200000n,
  );
  body.setTtl(Core.Slot(200));
  const tx = new Core.Transaction(body, new Core.TransactionWitnessSet());
  boundary.sign.mockImplementation(async (copy: Core.Transaction) => copy);
  const draft = {
    tx,
    originalBody: tx.body().toCbor(),
    originalAuxiliary: undefined,
    requiredFundingKeys: [],
    inputSnapshot: [],
    paymentAddress: address.toBech32(),
    validUntil: 200,
    blaze: {
      wallet: { getChangeAddress: async () => address },
      signTransaction: boundary.sign,
      provider: { postTransactionToChain: boundary.post, resolveUnspentOutputs: async () => [] },
    },
  } as unknown as KernelDraft;
  return { draft, api: {} as Cip30WalletApi };
}
it("does not post a Kernel draft that expires during wallet approval", async () => {
  const { draft, api } = fixture();
  let approve: () => void = () => {
    throw new Error("Signing not reached");
  };
  boundary.sign.mockImplementation(
    (copy: Core.Transaction) =>
      new Promise<Core.Transaction>((resolve) => {
        approve = () => resolve(copy);
      }),
  );
  const submitted = submitKernelTransaction(api, draft, () => {});
  await vi.waitFor(() => expect(boundary.sign).toHaveBeenCalledTimes(1));
  expect(boundary.post).not.toHaveBeenCalled();
  boundary.tip = 200;
  approve();
  await expect(submitted).rejects.toThrow("expired while signing");
  expect(boundary.post).not.toHaveBeenCalled();
  expect(boundary.fetch).toHaveBeenCalledTimes(2);
});
it("submits when the signed draft remains before its upper slot bound", async () => {
  const { draft, api } = fixture();
  boundary.sign.mockImplementation(async (copy: Core.Transaction) => {
    boundary.tip = 199;
    return copy;
  });
  await expect(submitKernelTransaction(api, draft, () => {})).resolves.toBe(
    draft.tx.getId(),
  );
  expect(boundary.post).toHaveBeenCalledTimes(1);
});
it.each([-1, NaN, Infinity, 1.5])(
  "rejects invalid post-approval slot %s",
  async (slot) => {
    const { draft, api } = fixture();
    boundary.sign.mockImplementation(async (copy: Core.Transaction) => {
      boundary.tip = slot;
      return copy;
    });
    await expect(submitKernelTransaction(api, draft, () => {})).rejects.toThrow(
      "expired while signing",
    );
    expect(boundary.post).not.toHaveBeenCalled();
  },
);

it("rejects wallet auxiliary data changes even when the transaction body is unchanged", async () => {
  const { draft, api } = fixture();
  boundary.sign.mockImplementation(async (copy: Core.Transaction) => {
    const auxiliary = Core.AuxiliaryData.fromCbor(Core.HexBlob("a1016161"));
    copy.setAuxiliaryData(auxiliary);
    return copy;
  });
  await expect(submitKernelTransaction(api, draft, () => {})).rejects.toThrow("changed the reviewed transaction");
  expect(boundary.post).not.toHaveBeenCalled();
});
it("rejects a missing funding key witness", async () => {
  const { draft, api } = fixture();
  draft.requiredFundingKeys = ["11".repeat(28)];
  await expect(submitKernelTransaction(api, draft, () => {})).rejects.toThrow("sign every funding input");
  expect(boundary.post).not.toHaveBeenCalled();
});
it("rejects a reference consumed while wallet approval is open", async () => {
  const { draft, api } = fixture();
  const utxo = new Core.TransactionUnspentOutput(new Core.TransactionInput(Core.TransactionId("22".repeat(32)), 0n), draft.tx.body().outputs()[0]);
  draft.inputSnapshot = [utxo.toCbor()];
  vi.spyOn(draft.blaze.provider, "resolveUnspentOutputs").mockResolvedValueOnce([utxo]).mockResolvedValueOnce([]);
  await expect(submitKernelTransaction(api, draft, () => {})).rejects.toThrow("inputs changed or were spent");
  expect(boundary.sign).toHaveBeenCalledTimes(1);
  expect(boundary.post).not.toHaveBeenCalled();
});
