// @vitest-environment node
import { Core } from "@blaze-cardano/sdk";
import { expect, it, vi } from "vitest";
import { assertTransactionNetwork, assertWalletSession } from "./walletSession";

it("rejects a departed session before accessing the wallet", async () => {
  const getNetworkId = vi.fn(async () => 0);
  await expect(
    assertWalletSession({ getNetworkId }, () => {
      throw new Error("Session changed");
    }),
  ).rejects.toThrow("Session changed");
  expect(getNetworkId).not.toHaveBeenCalled();
});
it("rejects a session change while the wallet network read is pending", async () => {
  let active = true;
  let complete!: (network: number) => void;
  const result = assertWalletSession(
    {
      getNetworkId: () =>
        new Promise<number>((resolve) => {
          complete = resolve;
        }),
    },
    () => {
      if (!active) throw new Error("Session changed");
    },
  );
  active = false;
  complete(0);
  await expect(result).rejects.toThrow("Session changed");
});
it("rejects a live mainnet wallet even when application connection state remains unchanged", async () => {
  await expect(
    assertWalletSession({ getNetworkId: async () => 1 }, () => {}),
  ).rejects.toThrow("testnet");
});

it("requires actual selected-chain funding even though both wallets report network zero", async () => {
  const { tx, output } = fundingFixture();
  const resolveUnspentOutputs = vi.fn(async () => [output]);
  await assertTransactionNetwork(tx, () => {}, { resolveUnspentOutputs });
  expect(resolveUnspentOutputs).toHaveBeenCalledWith(
    tx.body().inputs().values(),
  );
  resolveUnspentOutputs.mockResolvedValue([]);
  await expect(
    assertTransactionNetwork(tx, () => {}, { resolveUnspentOutputs }),
  ).rejects.toThrow(/funding is not available/);
});
it("rejects a session change during funding resolution", async () => {
  const { tx, output } = fundingFixture();
  let active = true;
  await expect(
    assertTransactionNetwork(
      tx,
      () => {
        if (!active) throw new Error("Session changed");
      },
      {
        resolveUnspentOutputs: async () => {
          active = false;
          return [output];
        },
      },
    ),
  ).rejects.toThrow("Session changed");
});
it("does not reuse funding evidence after an input is spent", async () => {
  const { tx, output } = fundingFixture();
  const resolveUnspentOutputs = vi
    .fn()
    .mockResolvedValueOnce([output])
    .mockResolvedValueOnce([]);
  await assertTransactionNetwork(tx, () => {}, { resolveUnspentOutputs });
  await expect(
    assertTransactionNetwork(tx, () => {}, { resolveUnspentOutputs }),
  ).rejects.toThrow(/funding is not available/);
  expect(resolveUnspentOutputs).toHaveBeenCalledTimes(2);
});
function fundingFixture() {
  const address = Core.addressFromCredential(
    0,
    Core.Credential.fromCore({
      type: Core.CredentialType.KeyHash,
      hash: Core.Hash28ByteBase16("11".repeat(28)),
    }),
  );
  const input = new Core.TransactionInput(
    Core.TransactionId("22".repeat(32)),
    0n,
  );
  const output = new Core.TransactionUnspentOutput(
    input,
    new Core.TransactionOutput(address, new Core.Value(10000000n)),
  );
  const tx = new Core.Transaction(
    new Core.TransactionBody(
      Core.CborSet.fromCore([input.toCore()], Core.TransactionInput.fromCore),
      [output.output()],
      170000n,
    ),
    new Core.TransactionWitnessSet(),
  );
  return { tx, output };
}
it("rejects REST/RPC chain disagreement before transaction validity data is used", async () => {
  const { assertDingoTransactionBackends } = await import("./walletSession");
  const { getDingoProvider } = await import("./utxorpc/provider");
  vi.spyOn(getDingoProvider().queryClient, "readGenesis").mockResolvedValue({
    networkMagic: 2,
  } as Awaited<
    ReturnType<
      ReturnType<typeof getDingoProvider>["queryClient"]["readGenesis"]
    >
  >);
  const fetch = vi
    .spyOn(globalThis, "fetch")
    .mockResolvedValue(new Response(JSON.stringify({ network_magic: 1 })));
  await expect(assertDingoTransactionBackends()).rejects.toThrow(
    /REST API must serve Preview/,
  );
  fetch.mockRestore();
  vi.restoreAllMocks();
});
