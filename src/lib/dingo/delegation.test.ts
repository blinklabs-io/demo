// @vitest-environment node
import { afterEach, beforeAll, expect, it, vi } from "vitest";
import { Core } from "@blaze-cardano/sdk";
import type { Cip30WalletApi } from "./cip30";
import { getBlaze } from "./blaze";
import { prepareDelegation, submitDelegation } from "./delegation";

vi.mock("./blaze", async (original) => ({
  ...(await original<typeof import("./blaze")>()),
  getBlaze: vi.fn(),
}));
vi.mock("./utxorpc/provider", async (original) => ({
  ...(await original<typeof import("./utxorpc/provider")>()),
  getDingoProvider: () => ({
    queryClient: { readGenesis: async () => ({ networkMagic: 2 }) },
  }),
}));
beforeAll(async () => {
  await Core.initCrypto();
});
afterEach(() => {
  vi.restoreAllMocks();
});

function fixture() {
  const key = Core.Ed25519PrivateKey.fromNormalHex(
    Core.Ed25519PrivateNormalKeyHex("11".repeat(32)),
  );
  const credential = {
    type: Core.CredentialType.KeyHash,
    hash: key.toPublic().hash().hex(),
  };
  const reward = Core.RewardAddress.fromCredentials(0, credential).toAddress();
  const change = Core.addressFromCredential(
    0,
    Core.Credential.fromCore(credential),
  );
  const tx = new Core.Transaction(
    new Core.TransactionBody(
      Core.CborSet.fromCore([], Core.TransactionInput.fromCore),
      [new Core.TransactionOutput(change, new Core.Value(10000000n))],
      170000n,
    ),
    new Core.TransactionWitnessSet(),
  );
  let network = 0,
    active = true;
  const api = {
    getNetworkId: vi.fn(async () => network),
    getRewardAddresses: async () => [reward.toBytes()],
    getChangeAddress: async () => change.toBytes(),
  } as unknown as Cip30WalletApi;
  const assertCurrent = () => {
    if (!active) throw new Error("Session changed");
  };
  const signed = () => {
    const copy = Core.Transaction.fromCbor(tx.toCbor());
    const witness = new Core.TransactionWitnessSet();
    witness.setVkeys(
      Core.CborSet.fromCore(
        [[key.toPublic().hex(), key.sign(Core.HexBlob(tx.getId())).hex()]],
        Core.VkeyWitness.fromCore,
      ),
    );
    copy.setWitnessSet(witness);
    return copy;
  };
  const post = vi.fn(async () => tx.getId());
  const sign = vi.fn(async () => signed());
  const builder = {
    addRegisterStake: vi.fn(),
    addDelegation: vi.fn(),
    addVoteDelegation: vi.fn(),
    setValidUntil: vi.fn(),
    complete: vi.fn(async () => tx),
  };
  for (const method of [
    builder.addRegisterStake,
    builder.addDelegation,
    builder.addVoteDelegation,
    builder.setValidUntil,
  ])
    method.mockReturnValue(builder);
  const blaze = {
    newTransaction: () => builder,
    signTransaction: sign,
    submitTransaction: post,
    params: { stakeKeyDeposit: 2000000 },
  };
  vi.mocked(getBlaze).mockResolvedValue({ blaze } as unknown as Awaited<
    ReturnType<typeof getBlaze>
  >);
  vi.spyOn(globalThis, "fetch").mockImplementation(
    async (url) =>
      new Response(
        JSON.stringify(
          String(url).includes("/blocks/latest")
            ? { slot: 100 }
            : { registered: true, pool_id: null, drep_id: null },
        ),
        { headers: { "Content-Type": "application/json" } },
      ),
  );
  const target = {
    kind: "pool" as const,
    id: Core.PoolId.fromKeyHash(Core.Ed25519KeyHashHex("22".repeat(28))),
  };
  return {
    api,
    reward: reward.toBech32(),
    target,
    assertCurrent,
    builder,
    sign,
    post,
    tx,
    signed,
    disconnect: () => {
      active = false;
    },
    mainnet: () => {
      network = 1;
    },
  };
}
it("builds a review without signing, and submits only after a separate explicit call", async () => {
  const f = fixture();
  const draft = await prepareDelegation(
    f.api,
    f.reward,
    f.target,
    f.assertCurrent,
  );
  expect(f.sign).not.toHaveBeenCalled();
  expect(f.post).not.toHaveBeenCalled();
  await submitDelegation(f.api, draft, f.assertCurrent);
  expect(f.sign).toHaveBeenCalledTimes(1);
  expect(f.post).toHaveBeenCalledTimes(1);
});
it("does not publish a prepared delegation when its session leaves while build is pending", async () => {
  const f = fixture();
  let finish!: (tx: Core.Transaction) => void;
  let entered!: () => void;
  const started = new Promise<void>((resolve) => {
    entered = resolve;
  });
  f.builder.complete.mockImplementation(() => {
    entered();
    return new Promise((resolve) => {
      finish = resolve;
    });
  });
  const pending = prepareDelegation(f.api, f.reward, f.target, f.assertCurrent);
  await started;
  f.disconnect();
  finish(f.tx);
  await expect(pending).rejects.toThrow("Session changed");
  expect(f.sign).not.toHaveBeenCalled();
  expect(f.post).not.toHaveBeenCalled();
});
it("does not submit after disconnect while the wallet signature is pending", async () => {
  const f = fixture();
  const draft = await prepareDelegation(
    f.api,
    f.reward,
    f.target,
    f.assertCurrent,
  );
  f.sign.mockImplementation(async () => {
    f.disconnect();
    return f.signed();
  });
  await expect(submitDelegation(f.api, draft, f.assertCurrent)).rejects.toThrow(
    "Session changed",
  );
  expect(f.post).not.toHaveBeenCalled();
});
it("does not submit when wallet switches network while signing, despite unchanged app session", async () => {
  const f = fixture();
  const draft = await prepareDelegation(
    f.api,
    f.reward,
    f.target,
    f.assertCurrent,
  );
  f.sign.mockImplementation(async () => {
    f.mainnet();
    return f.signed();
  });
  await expect(submitDelegation(f.api, draft, f.assertCurrent)).rejects.toThrow(
    "testnet",
  );
  expect(f.post).not.toHaveBeenCalled();
});
