import { CARDANO_NETWORK_ID } from "./networkIdentity";
import { Core } from "@blaze-cardano/sdk";
import { DINGO_NETWORK } from "./config";
import { assertDingoNetwork, getDingoProvider, type DingoProvider } from "./utxorpc/provider";
import { blockfrostFetch } from "./blockfrost";
import type { Cip30WalletApi } from "./cip30";

export async function assertWalletSession(
  wallet: Pick<Cip30WalletApi, "getNetworkId">,
  assertCurrent: () => void,
): Promise<void> {
  assertCurrent();
  const network = await wallet.getNetworkId();
  assertCurrent();
  if (network !== CARDANO_NETWORK_ID)
    throw new Error(
      `Wallet network changed. Connect a ${CARDANO_NETWORK_ID === 1 ? "mainnet" : "testnet"} wallet and review a new transaction.`,
    );
}

export async function assertTransactionNetwork(
  transaction: Core.Transaction,
  assertCurrent: () => void,
  provider: Pick<DingoProvider, "resolveUnspentOutputs"> = getDingoProvider(),
): Promise<void> {
  assertCurrent();
  if (transaction.toCbor().length > 131072)
    throw new Error("Transaction exceeds the 64 KiB verification limit.");
  const body = transaction.body();
  const key = (input: Core.TransactionInput) =>
    `${input.transactionId()}#${input.index()}`;
  const inputs = [
    ...new Map(
      [...body.inputs().values(), ...(body.collateral()?.values() ?? [])].map(
        (input) => [key(input), input],
      ),
    ).values(),
  ];
  const requested = new Set(inputs.map(key));
  if (!body.inputs().size())
    throw new Error("Transaction requires a spending input.");
  const resolved = await provider.resolveUnspentOutputs(inputs);
  assertCurrent();
  const found = new Set(resolved.map((output) => key(output.input())));
  if (
    resolved.length !== requested.size ||
    found.size !== requested.size ||
    [...requested].some((input) => !found.has(input)) ||
    resolved.some((output) => output.output().address().getNetworkId() !== CARDANO_NETWORK_ID)
  )
    throw new Error(
      `Transaction funding is not available on ${DINGO_NETWORK.label}. Switch your wallet to ${DINGO_NETWORK.label} and build a new transaction.`,
    );
}

export async function assertDingoTransactionBackends() {
  const [, genesis] = await Promise.all([
    assertDingoNetwork(getDingoProvider()),
    blockfrostFetch<{ network_magic: number }>("/api/v0/genesis"),
  ]);
  if (genesis.network_magic !== DINGO_NETWORK.networkMagic)
    throw new Error(
      `Dingo REST API must serve ${DINGO_NETWORK.label} (network magic ${DINGO_NETWORK.networkMagic}).`,
    );
}
