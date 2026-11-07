// @vitest-environment node
import { Core } from "@blaze-cardano/sdk";
import { expect, it, vi } from "vitest";
const network = vi.hoisted(() => ({ id: "dijkstra", label: "Dijkstra", networkMagic: 6 }));
vi.mock("../config", () => ({
  DINGO_NETWORK: network,
  DINGO_CONFIG: { blockfrostUrl: "https://rest.example", utxorpcUrl: "https://rpc.example", meshUrl: "https://mesh.example" },
}));
it.each([["dijkstra", "Dijkstra", 6], ["prime-testnet", "Prime Testnet", 3311]] as const)("verifies %s genesis and rejects another testnet before submission", async (id, label, magic) => {
  Object.assign(network, { id, label, networkMagic: magic });
  const { DingoProvider, assertDingoNetwork } = await import("./provider");
  const provider = new DingoProvider();
  expect(provider.networkName).toBe("unknown");
  const genesis = vi.spyOn(provider.queryClient, "readGenesis").mockResolvedValue({ networkMagic: magic } as Awaited<ReturnType<typeof provider.queryClient.readGenesis>>);
  await expect(assertDingoNetwork(provider)).resolves.toContain(label);
  genesis.mockResolvedValue({ networkMagic: 2 } as Awaited<ReturnType<typeof provider.queryClient.readGenesis>>);
  const submit = vi.spyOn(provider.submitClient, "submitTx");
  await expect(provider.postTransactionToChain(Core.Transaction.fromCbor(Core.TxCBOR("84a3008001800200a0f5f6")))).rejects.toThrow(`requires ${label}`);
  expect(submit).not.toHaveBeenCalled();
});
