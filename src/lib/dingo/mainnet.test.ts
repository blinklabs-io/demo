// @vitest-environment node
import { Core } from "@blaze-cardano/sdk";
import { beforeAll, expect, it, vi } from "vitest";
import type { Cip30WalletApi } from "./cip30";
import { DingoProvider } from "./utxorpc/DingoProvider";
import { assertWalletSession, assertTransactionNetwork } from "./walletSession";
import { blockfrostFetch } from "./blockfrost";
import { prepareToolTransaction, submitToolTransaction } from "../tools/transactions";
const state = vi.hoisted(() => ({ provider: null as unknown as DingoProvider }));
vi.mock("./config", () => ({ DINGO_NETWORK: { id: "mainnet", label: "Mainnet", networkMagic: 764824073 }, DINGO_CONFIG: { blockfrostUrl: "https://rest.example", utxorpcUrl: "https://rpc.example" } }));
vi.mock("./utxorpc/provider", async (original) => ({ ...await original<typeof import("./utxorpc/provider")>(), getDingoProvider: () => state.provider }));
vi.mock("./blockfrost", async (original) => ({ ...await original<typeof import("./blockfrost")>(), blockfrostFetch: vi.fn() }));
beforeAll(() => Core.initCrypto());
function fixture() {
  const key = Core.Ed25519PrivateKey.fromNormalHex(Core.Ed25519PrivateNormalKeyHex("11".repeat(32)));
  const address = (network: number) => Core.addressFromCredential(network, Core.Credential.fromCore({ type: Core.CredentialType.KeyHash, hash: key.toPublic().hash().hex() }));
  const funding = new Core.TransactionUnspentOutput(new Core.TransactionInput(Core.TransactionId("44".repeat(32)), 0n), new Core.TransactionOutput(address(1), new Core.Value(100000000n)));
  let network = 1, signing: (() => void) | undefined;
  const api = { getNetworkId: async () => network, getChangeAddress: async () => address(1).toBytes(), getUtxos: async () => [funding.toCbor()], getCollateral: async () => [], signTx: vi.fn(async (cbor: string) => {
    const tx = Core.Transaction.fromCbor(Core.TxCBOR(cbor)), witness = new Core.TransactionWitnessSet();
    witness.setVkeys(Core.CborSet.fromCore([[key.toPublic().hex(), key.sign(Core.HexBlob(tx.getId())).hex()]], Core.VkeyWitness.fromCore)); signing?.(); return witness.toCbor();
  }) } as unknown as Cip30WalletApi;
  const provider = state.provider = new DingoProvider();
  vi.spyOn(provider.queryClient, "readGenesis").mockResolvedValue({ networkMagic: 764824073 } as Awaited<ReturnType<typeof provider.queryClient.readGenesis>>);
  vi.spyOn(provider, "getParameters").mockResolvedValue(Core.hardCodedProtocolParams);
  vi.spyOn(provider, "resolveUnspentOutputs").mockImplementation(async (inputs) => inputs.filter((input) => input.toCbor() === funding.input().toCbor()).map(() => funding));
  const post = vi.spyOn(provider, "postTransactionToChain").mockImplementation(async (tx) => tx.getId());
  vi.mocked(blockfrostFetch).mockImplementation(async (path) => (path.endsWith("genesis") ? { network_magic: 764824073 } : { slot: 1000 }) as never);
  const action = { kind: "send" as const, address: address(1).toBech32(), ada: "10", assets: [] };
  return { api, provider, post, funding, address, action, setNetwork: (value: number) => { network = value; }, onSign: (fn: () => void) => { signing = fn; } };
}
it("builds, signs and submits a mainnet payment with a mainnet provider", async () => {
  const f = fixture(); expect(f.provider.network).toBe(1);
  const draft = await prepareToolTransaction(f.api, f.action, () => {});
  expect(draft.tx.body().outputs().every((output) => output.address().getNetworkId() === 1)).toBe(true);
  expect(await submitToolTransaction(f.api, draft, () => {})).toBe(draft.tx.getId());
  expect(f.post).toHaveBeenCalledOnce();
});
it("rejects testnet wallets, recipients, funding, and a network change while signing", async () => {
  const f = fixture(); f.setNetwork(0);
  await expect(assertWalletSession(f.api, () => {})).rejects.toThrow("mainnet wallet"); f.setNetwork(1);
  await expect(prepareToolTransaction(f.api, { ...f.action, address: f.address(0).toBech32() }, () => {})).rejects.toThrow("mainnet payment address");
  const draft = await prepareToolTransaction(f.api, f.action, () => {});
  const wrong = new Core.TransactionUnspentOutput(f.funding.input(), new Core.TransactionOutput(f.address(0), new Core.Value(100000000n)));
  await expect(assertTransactionNetwork(draft.tx, () => {}, { resolveUnspentOutputs: async () => [wrong] })).rejects.toThrow("funding is not available on Mainnet");
  f.onSign(() => f.setNetwork(0));
  await expect(submitToolTransaction(f.api, draft, () => {})).rejects.toThrow("mainnet wallet");
  expect(f.post).not.toHaveBeenCalled();
});
