// @vitest-environment node
import { afterEach, expect, it, vi } from "vitest";
vi.mock("../config", () => ({
  DINGO_NETWORK: { id: "preprod", label: "Preprod", networkMagic: 1 },
  DINGO_CONFIG: {
    blockfrostUrl: "http://127.0.0.1:3000",
    utxorpcUrl: "http://127.0.0.1:9090",
    meshUrl: "http://127.0.0.1:8080",
  },
}));
afterEach(() => {
  vi.resetModules();
});
it("accepts selected Preprod genesis and rejects Preview genesis before transaction building", async () => {
  vi.resetModules();
  const { assertDingoNetwork } = await import("./provider");
  const selected = {
    queryClient: { readGenesis: async () => ({ networkMagic: 1 }) },
  };
  await expect(
    assertDingoNetwork(selected as Parameters<typeof assertDingoNetwork>[0]),
  ).resolves.toContain("Preprod genesis confirmed");
  selected.queryClient.readGenesis = async () => ({ networkMagic: 2 });
  await expect(
    assertDingoNetwork(selected as Parameters<typeof assertDingoNetwork>[0]),
  ).rejects.toThrow("requires Preprod (1)");
});
it("checks selected genesis before submitting any transaction bytes", async () => {
  vi.resetModules();
  const { DingoProvider } = await import("./DingoProvider");
  const { Core } = await import("@blaze-cardano/sdk");
  const provider = new DingoProvider();
  const genesis = vi
    .spyOn(provider.queryClient, "readGenesis")
    .mockResolvedValue({ networkMagic: 2 } as Awaited<
      ReturnType<typeof provider.queryClient.readGenesis>
    >);
  const submit = vi
    .spyOn(provider.submitClient, "submitTx")
    .mockRejectedValue(new Error("Unexpected submission"));
  const tx = Core.Transaction.fromCbor(Core.TxCBOR("84a3008001800200a0f5f6"));
  await expect(provider.postTransactionToChain(tx)).rejects.toThrow(
    "requires Preprod",
  );
  expect(submit).not.toHaveBeenCalled();
  genesis.mockResolvedValue({ networkMagic: 1 } as Awaited<
    ReturnType<typeof provider.queryClient.readGenesis>
  >);
  submit.mockResolvedValue(
    Uint8Array.from(String(tx.getId()).match(/../g)!, (byte) =>
      Number.parseInt(byte, 16),
    ),
  );
  await expect(provider.postTransactionToChain(tx)).resolves.toBe(tx.getId());
  expect(submit).toHaveBeenCalledOnce();
});
it("does not submit if the draft is cancelled while selected genesis verification is pending", async () => {
  const { DingoProvider } = await import("./DingoProvider");
  const { Core } = await import("@blaze-cardano/sdk");
  const provider = new DingoProvider();
  let finish!: () => void;
  vi.spyOn(provider.queryClient, "readGenesis").mockImplementation(
    () =>
      new Promise((resolve) => {
        finish = () =>
          resolve({ networkMagic: 1 } as Awaited<
            ReturnType<typeof provider.queryClient.readGenesis>
          >);
      }),
  );
  const submit = vi
    .spyOn(provider.submitClient, "submitTx")
    .mockRejectedValue(new Error("Unexpected submission"));
  const tx = Core.Transaction.fromCbor(Core.TxCBOR("84a3008001800200a0f5f6"));
  let active = true;
  const pending = provider.postTransactionToChain(tx, () => {
    if (!active) throw new Error("Draft changed");
  });
  active = false;
  finish();
  await expect(pending).rejects.toThrow("Draft changed");
  expect(submit).not.toHaveBeenCalled();
});
