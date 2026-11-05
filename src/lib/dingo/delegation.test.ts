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
const fundingResolver = vi.hoisted(() => vi.fn());
vi.mock("./utxorpc/provider", async (original) => ({
  ...(await original<typeof import("./utxorpc/provider")>()),
  getDingoProvider: () => ({
    queryClient: { readGenesis: async () => ({ networkMagic: 2 }) },
    resolveUnspentOutputs: fundingResolver,
  }),
}));
beforeAll(async () => {
  await Core.initCrypto();
});
afterEach(() => {
  vi.restoreAllMocks();
});

function fixture(registered = true) {
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
  const funding = new Core.TransactionInput(
    Core.TransactionId("44".repeat(32)),
    0n,
  );
  const tx = new Core.Transaction(
    new Core.TransactionBody(
      Core.CborSet.fromCore([funding.toCore()], Core.TransactionInput.fromCore),
      [new Core.TransactionOutput(change, new Core.Value(10000000n))],
      170000n,
    ),
    new Core.TransactionWitnessSet(),
  );
  fundingResolver.mockResolvedValue([
    new Core.TransactionUnspentOutput(
      funding,
      new Core.TransactionOutput(change, new Core.Value(10000000n)),
    ),
  ]);
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
    provider: { postTransactionToChain: post },
    params: { stakeKeyDeposit: 2000000 },
  };
  vi.mocked(getBlaze).mockResolvedValue({ blaze } as unknown as Awaited<
    ReturnType<typeof getBlaze>
  >);
  const targetState = {
    exists: true,
    retired: false,
    retirementEpoch: null as number | null,
  };
  vi.spyOn(globalThis, "fetch").mockImplementation(async (url) => {
    const path = String(url);
    if (path.endsWith("/api/v0/genesis"))
      return new Response(JSON.stringify({ network_magic: 2 }));
    if (path.includes("/pools/") && !targetState.exists)
      return new Response(JSON.stringify({ message: "Not found" }), {
        status: 404,
      });
    const data = path.includes("/blocks/latest")
      ? { slot: 100, epoch: 10 }
      : path.includes("/txs/")
        ? { cbor: retirementTx().toCbor() }
        : path.includes("/updates?")
          ? [
              {
                tx_hash:
                  targetState.retirementEpoch === null
                    ? "33".repeat(32)
                    : String(retirementTx().getId()),
                cert_index: 0,
                action:
                  targetState.retirementEpoch === null
                    ? "registered"
                    : "deregistered",
              },
            ]
          : path.includes("/pools/")
            ? { pool_id: target.id, registration: ["33".repeat(32)] }
            : path.includes("/governance/dreps/")
              ? {
                  drep_id: path.split("/").at(-1),
                  retired: targetState.retired,
                }
              : { registered, pool_id: null, drep_id: null };
    return new Response(JSON.stringify(data), {
      headers: { "Content-Type": "application/json" },
    });
  });
  const target = {
    kind: "pool" as const,
    id: Core.PoolId.fromKeyHash(Core.Ed25519KeyHashHex("22".repeat(28))),
  };
  function retirementTx() {
    const body = new Core.TransactionBody(
      Core.CborSet.fromCore([], Core.TransactionInput.fromCore),
      [],
      0n,
    );
    const cert = Core.Certificate.newPoolRetirement(
      new Core.PoolRetirement(
        Core.PoolId.toKeyHash(target.id),
        Core.EpochNo(targetState.retirementEpoch!),
      ),
    );
    body.setCerts(
      Core.CborSet.fromCore([cert.toCore()], Core.Certificate.fromCore),
    );
    return new Core.Transaction(body, new Core.TransactionWitnessSet());
  }
  return {
    api,
    targetState,
    credential,
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
it.each([true, false])(
  "builds the correct delegation certificates before a separate explicit signature (registered=%s)",
  async (registered) => {
    const f = fixture(registered);
    const draft = await prepareDelegation(
      f.api,
      f.reward,
      f.target,
      f.assertCurrent,
    );
    expect(f.builder.addDelegation).toHaveBeenCalledTimes(1);
    expect(f.builder.addDelegation.mock.calls[0][0].toCore()).toEqual(
      f.credential,
    );
    expect(f.builder.addDelegation.mock.calls[0][1]).toBe(f.target.id);
    expect(f.builder.addRegisterStake).toHaveBeenCalledTimes(
      registered ? 0 : 1,
    );
    expect(f.builder.addVoteDelegation).not.toHaveBeenCalled();
    expect(f.sign).not.toHaveBeenCalled();
    expect(f.post).not.toHaveBeenCalled();
    await submitDelegation(f.api, draft, f.assertCurrent);
    expect(f.sign).toHaveBeenCalledTimes(1);
    expect(f.post).toHaveBeenCalledTimes(1);
  },
);
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

it("rejects an unknown pool before building or prompting the wallet", async () => {
  const f = fixture();
  f.targetState.exists = false;
  await expect(
    prepareDelegation(f.api, f.reward, f.target, f.assertCurrent),
  ).rejects.toThrow("not registered");
  expect(f.builder.complete).not.toHaveBeenCalled();
  expect(f.sign).not.toHaveBeenCalled();
});
it("rechecks the pool target before signing a previously reviewed draft", async () => {
  const f = fixture();
  const draft = await prepareDelegation(
    f.api,
    f.reward,
    f.target,
    f.assertCurrent,
  );
  f.targetState.exists = false;
  await expect(submitDelegation(f.api, draft, f.assertCurrent)).rejects.toThrow(
    "not registered",
  );
  expect(f.sign).not.toHaveBeenCalled();
  expect(f.post).not.toHaveBeenCalled();
});
it("rejects a retired DRep before creating a reviewed transaction", async () => {
  const f = fixture();
  f.targetState.retired = true;
  const id = Core.Cardano.DRepID.cip129FromCredential(f.credential);
  await expect(
    prepareDelegation(f.api, f.reward, { kind: "drep", id }, f.assertCurrent),
  ).rejects.toThrow("retired");
  expect(f.builder.complete).not.toHaveBeenCalled();
  expect(f.sign).not.toHaveBeenCalled();
});

it.each([8, 12])(
  "checks a retirement certificate's effective epoch rather than rejecting all announced retirements (epoch=%s)",
  async (epoch) => {
    const f = fixture();
    f.targetState.retirementEpoch = epoch;
    const result = prepareDelegation(
      f.api,
      f.reward,
      f.target,
      f.assertCurrent,
    );
    if (epoch <= 10) {
      await expect(result).rejects.toThrow("has retired");
      expect(f.builder.complete).not.toHaveBeenCalled();
    } else {
      await expect(result).resolves.toMatchObject({ target: f.target });
      expect(f.builder.complete).toHaveBeenCalledTimes(1);
    }
  },
);
