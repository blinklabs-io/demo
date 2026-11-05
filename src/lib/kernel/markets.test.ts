// @vitest-environment node
import { Core } from "@blaze-cardano/sdk";
import { beforeAll, expect, it, vi } from "vitest";
import type { DingoProvider } from "../dingo/utxorpc/provider";
import { SPOT_UTXO_CBOR } from "./fixtures";
import { KERNEL_LANES } from "./protocol";
import { loadKernelPage, loadKernelRequest, kernelRecord } from "./markets";
vi.mock("../dingo/config", async (original) => ({
  ...(await original<typeof import("../dingo/config")>()),
  DINGO_NETWORK: { id: "preprod", label: "Preprod", networkMagic: 1 },
}));
beforeAll(() => Core.initCrypto());
function fixture() {
  const utxo = Core.TransactionUnspentOutput.fromCbor(
    Core.HexBlob(SPOT_UTXO_CBOR),
  );
  const response = {
    items: [
      {
        txoRef: {
          hash: Core.fromHex(String(utxo.input().transactionId())),
          index: Number(utxo.input().index()),
        },
        nativeBytes: Core.fromHex(utxo.output().toCbor()),
      },
      {
        txoRef: { hash: Core.fromHex("99".repeat(32)), index: 0 },
        nativeBytes: new Uint8Array(),
      },
    ],
    nextToken: "bounded-next-page",
    ledgerTip: { hash: Core.fromHex("22".repeat(32)), height: 10n, slot: 100n },
  };
  const search = vi.fn(async () => response),
    resolve = vi.fn(async () =>
      KERNEL_LANES.aftermarket.references.map((ref) => ({
        input: () =>
          new Core.TransactionInput(
            Core.TransactionId(ref.hash),
            BigInt(ref.index),
          ),
        output: () => ({
          address: () => utxo.output().address(),
          scriptRef: () => ({ hash: () => ref.hashScript }),
        }),
      })),
    );
  const provider = {
    queryClient: {
      readGenesis: async () => ({ networkMagic: 1 }),
      inner: { searchUtxos: search },
    },
    resolveUnspentOutputs: resolve,
  } as unknown as DingoProvider;
  return { provider, search, resolve };
}
it("queries one bounded policy page and retains usable records, explicit rejects, cursor and snapshot", async () => {
  const { provider, search } = fixture();
  const page = await loadKernelPage(
    "aftermarket",
    "previous",
    undefined,
    provider,
  );
  expect(search).toHaveBeenCalledWith(
    expect.objectContaining({
      maxItems: 24,
      startToken: "previous",
      predicate: expect.objectContaining({ match: expect.anything() }),
    }),
    { signal: undefined },
  );
  expect(page.records).toHaveLength(1);
  expect(page.records[0].kind).toBe("SpotDatum");
  expect(page.rejected).toHaveLength(1);
  expect(page.nextToken).toBe("bounded-next-page");
  expect(page.snapshot).toMatchObject({ height: 10n, slot: 100n });
});
it("stops before discovery when the caller cancels during reference verification", async () => {
  const { provider, resolve, search } = fixture(),
    controller = new AbortController(),
    original = resolve.getMockImplementation()!;
  resolve.mockImplementation(async () => {
    const refs = await original();
    controller.abort();
    return refs;
  });
  await expect(
    loadKernelPage("aftermarket", "", controller.signal, provider),
  ).rejects.toThrow();
  expect(search).not.toHaveBeenCalled();
});
it("keeps transport failure distinct from an empty market", async () => {
  const { provider, search } = fixture();
  search.mockRejectedValue(new Error("Dingo unavailable"));
  await expect(
    loadKernelPage("aftermarket", "", undefined, provider),
  ).rejects.toThrow("Dingo unavailable");
});

it("resolves an exact live request without scanning and rejects a substituted output", async () => {
  const { createKernelPlan } = await import("./actions");
  const plan = createKernelPlan(
    {
      kind: "loan-ask",
      principal: 10000000n,
      termDays: 30,
      collateral: { policyId: "33".repeat(28), name: "01" },
      deposit: 5000000n,
    },
    Core.addressFromCredential(
      0,
      Core.Credential.fromCore({
        type: Core.CredentialType.KeyHash,
        hash: Core.Hash28ByteBase16("11".repeat(28)),
      }),
    ),
    "11".repeat(28),
  );
  const output = new Core.TransactionOutput(plan.address, plan.value);
  output.setDatum(Core.Datum.newInlineData(plan.datum));
  const input = new Core.TransactionInput(
    Core.TransactionId("ab".repeat(32)),
    2n,
  );
  const resolve = vi.fn(async () => [
    new Core.TransactionUnspentOutput(input, output),
  ]);
  const search = vi.fn();
  const provider = {
    queryClient: {
      readGenesis: async () => ({ networkMagic: 1 }),
      inner: { searchUtxos: search },
    },
    resolveUnspentOutputs: resolve,
  } as unknown as DingoProvider;
  const request = await loadKernelRequest(
    "ab".repeat(32) + "#2",
    undefined,
    provider,
  );
  expect(request.kind).toBe("AskDatum");
  const canonical = await loadKernelRequest(
    "ab".repeat(32).toUpperCase() + "#2",
    undefined,
    provider,
  );
  expect(canonical.outpoint).toBe("ab".repeat(32) + "#2");
  expect(resolve).toHaveBeenCalledTimes(2);
  expect(search).not.toHaveBeenCalled();
  await expect(
    loadKernelRequest("55".repeat(32) + "#2", undefined, provider),
  ).rejects.toThrow("spent or unavailable");
});
it("does not query invalid or cancelled exact request imports", async () => {
  const { provider, resolve } = fixture();
  await expect(
    loadKernelRequest("not-an-outpoint", undefined, provider),
  ).rejects.toThrow("request transaction hash");
  const controller = new AbortController();
  controller.abort();
  await expect(
    loadKernelRequest("44".repeat(32) + "#0", controller.signal, provider),
  ).rejects.toBeDefined();
  expect(resolve).not.toHaveBeenCalled();
});
it.each([-1, 0.5, 4294967296, Number.NaN, Number.POSITIVE_INFINITY])(
  "rejects invalid RPC output index %s before exposing a selectable record",
  async (index) => {
    const { provider, search } = fixture();
    const response = await search();
    response.items[0].txoRef.index = index;
    search.mockResolvedValue(response);
    await expect(
      loadKernelPage("aftermarket", "", undefined, provider),
    ).rejects.toThrow(/invalid Kernel output reference/);
  },
);

it("rejects a negotiation datum masquerading as an active-loan lane", async () => {
  const { createKernelPlan } = await import("./actions");
  const owner = Core.Credential.fromCore({
    type: Core.CredentialType.KeyHash,
    hash: Core.Hash28ByteBase16("11".repeat(28)),
  });
  const plan = createKernelPlan(
    {
      kind: "loan-ask",
      principal: 10000000n,
      termDays: 30,
      collateral: { policyId: "33".repeat(28), name: "01" },
      deposit: 5000000n,
    },
    Core.addressFromCredential(0, owner),
    "11".repeat(28),
  );
  const tokens = new Map(plan.value.multiasset());
  tokens.set(
    Core.AssetId(KERNEL_LANES["loan-active"].beaconPolicy + "ffff"),
    1n,
  );
  const output = new Core.TransactionOutput(
    plan.address,
    new Core.Value(plan.value.coin(), tokens),
  );
  output.setDatum(Core.Datum.newInlineData(plan.datum));
  expect(() =>
    kernelRecord(
      "loan-active",
      new Core.TransactionUnspentOutput(
        new Core.TransactionInput(Core.TransactionId("ab".repeat(32)), 0n),
        output,
      ),
    ),
  ).toThrow(/kind.*lane/);
});
