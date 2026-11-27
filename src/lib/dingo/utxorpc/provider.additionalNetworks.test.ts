// @vitest-environment node
import { Core } from "@blaze-cardano/sdk";
import { expect, it, vi } from "vitest";
const network = vi.hoisted(() => ({ id: "dijkstra", label: "Dijkstra", networkMagic: 6 }));
vi.mock("../config", () => ({
  DINGO_NETWORK: network,
  DINGO_CONFIG: { blockfrostUrl: "https://rest.example", utxorpcUrl: "https://rpc.example", meshUrl: "https://mesh.example" },
}));
it.each([
  ["dijkstra", "Dijkstra", 6, undefined],
  ["prime-testnet", "Prime Testnet", 3311, undefined],
  ["prime-mainnet", "Prime Mainnet", 764824073, "2024-05-13T17:40:00Z"],
] as const)("verifies %s genesis and rejects another network before submission", async (id, label, magic, systemStart) => {
  Object.assign(network, { id, label, networkMagic: magic });
  const { DingoProvider, assertDingoNetwork } = await import("./provider");
  const { matchesDingoRestGenesis } = await import("../networkIdentity");
  const provider = new DingoProvider();
  expect(provider.networkName).toBe("unknown");
  const genesis = vi.spyOn(provider.queryClient, "readGenesis").mockResolvedValue({ networkMagic: magic, systemStart } as Awaited<ReturnType<typeof provider.queryClient.readGenesis>>);
  await expect(assertDingoNetwork(provider)).resolves.toContain(label);
  expect(matchesDingoRestGenesis({
    network_magic: magic,
    system_start: id === "prime-mainnet" ? 1715622000 : undefined,
  })).toBe(true);
  if (id === "prime-mainnet")
    expect(matchesDingoRestGenesis({
      network_magic: magic,
      system_start: 1506203091,
    })).toBe(false);
  genesis.mockResolvedValue({
    networkMagic: id === "prime-mainnet" ? magic : 2,
    systemStart: id === "prime-mainnet" ? "2017-09-23T21:44:51Z" : undefined,
  } as Awaited<ReturnType<typeof provider.queryClient.readGenesis>>);
  const submit = vi.spyOn(provider.submitClient, "submitTx");
  await expect(provider.postTransactionToChain(Core.Transaction.fromCbor(Core.TxCBOR("84a3008001800200a0f5f6")))).rejects.toThrow(`requires ${label}`);
  expect(submit).not.toHaveBeenCalled();
});
