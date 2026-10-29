import { Core } from "@blaze-cardano/sdk";
import { DingoProvider } from "./DingoProvider";
import { bytesToHex, hexToBytes } from "./bytes";
export { DingoProvider } from "./DingoProvider";

const MAX_SUMMARY_UTXOS = 200;
let cachedProvider: DingoProvider | null = null;
export function getDingoProvider(): DingoProvider {
  return (cachedProvider ??= new DingoProvider());
}
export async function assertDingoNetwork(
  provider: DingoProvider,
): Promise<string> {
  const genesis = await provider.queryClient.readGenesis();
  if (genesis.networkMagic !== 2)
    throw new Error(
      `Dingo reports network magic ${genesis.networkMagic}; this app requires Preview (2).`,
    );
  return `Preview genesis confirmed (network magic ${genesis.networkMagic}, ${genesis.networkId})`;
}

export type DingoUtxoSummary = {
  lovelace: bigint;
  utxoCount: number;
  truncated: boolean;
};

// summarizeDingoAddress reports what Dingo holds for one complete address.
// Dingo compares the full serialized address bytes, so a base address does
// not pick up enterprise UTxOs that only share its payment credential.
export async function summarizeDingoAddress(
  provider: DingoProvider,
  address: Core.Address,
): Promise<DingoUtxoSummary> {
  return summarizeResolvedUtxos(
    await provider.getUnspentOutputs(address),
    false,
  );
}

// summarizeDingoStakeCredential reports every UTxO whose address delegates to
// the given stake credential, across all address forms that share it. This is
// the closest view UTxO RPC offers of a stake address; live delegation,
// rewards, and pool assignment are node-to-client LocalStateQuery only.
export async function summarizeDingoStakeCredential(
  provider: DingoProvider,
  stakeCredentialHash: string,
): Promise<DingoUtxoSummary> {
  const rpcUtxos = await provider.queryClient.searchUtxosByDelegationPart(
    hexToBytes(stakeCredentialHash),
  );
  const truncated = rpcUtxos.length > MAX_SUMMARY_UTXOS;
  const references = rpcUtxos
    .slice(0, MAX_SUMMARY_UTXOS)
    .map(
      (utxo) =>
        new Core.TransactionInput(
          Core.TransactionId(bytesToHex(utxo.txoRef.hash)),
          BigInt(utxo.txoRef.index),
        ),
    );
  if (references.length === 0) {
    return { lovelace: 0n, utxoCount: 0, truncated };
  }

  return summarizeResolvedUtxos(
    await provider.resolveUnspentOutputs(references),
    truncated,
  );
}

export function stakeCredentialHashFor(
  address: Core.Address,
): string | undefined {
  return address.getProps().delegationPart?.hash;
}

function summarizeResolvedUtxos(
  utxos: Core.TransactionUnspentOutput[],
  truncated: boolean,
): DingoUtxoSummary {
  let lovelace = 0n;
  for (const utxo of utxos) {
    lovelace += utxo.output().amount().coin();
  }
  return { lovelace, utxoCount: utxos.length, truncated };
}
