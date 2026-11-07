// @vitest-environment node
import { Core } from "@blaze-cardano/sdk";
import { expect, it, vi } from "vitest";
vi.mock("../config", () => ({
  DINGO_NETWORK: { id: "musashi", label: "Musashi", networkMagic: 164 },
  DINGO_CONFIG: {
    blockfrostUrl: "https://rest.example",
    utxorpcUrl: "https://rpc.example",
    meshUrl: "https://mesh.example",
  },
}));

it("uses the custom network identity and refuses submission through a different testnet", async () => {
  const { DingoProvider } = await import("./DingoProvider");
  const { assertDingoNetwork } = await import("./provider");
  const provider = new DingoProvider();
  expect(provider.networkName).toBe("unknown");
  const genesis = vi
    .spyOn(provider.queryClient, "readGenesis")
    .mockResolvedValue({ networkMagic: 164 } as Awaited<
      ReturnType<typeof provider.queryClient.readGenesis>
    >);
  await expect(assertDingoNetwork(provider)).resolves.toContain(
    "Musashi genesis confirmed",
  );
  genesis.mockResolvedValue({ networkMagic: 1 } as Awaited<
    ReturnType<typeof provider.queryClient.readGenesis>
  >);
  const submit = vi
    .spyOn(provider.submitClient, "submitTx")
    .mockRejectedValue(new Error("Unexpected submission"));
  const tx = Core.Transaction.fromCbor(Core.TxCBOR("84a3008001800200a0f5f6"));
  await expect(provider.postTransactionToChain(tx)).rejects.toThrow(
    "requires Musashi",
  );
  expect(submit).not.toHaveBeenCalled();
});
