import { Core } from "@blaze-cardano/sdk";
import { blockfrostFetch, BlockfrostError } from "./blockfrost";
import type { AmountEntry } from "../../components/explorer/AdaAmount";

export interface WalletStakeAccount {
  stake_address: string;
  registered: boolean;
  active: boolean;
  controlled_amount: string;
  withdrawable_amount: string;
  pool_id: string | null;
  drep_id: string | null;
}

export interface WalletUtxo {
  address?: string;
  tx_hash: string;
  output_index: number;
  amount: AmountEntry[];
}

export function stakeAddressFor(address: string): string | undefined {
  const parsed = Core.Address.fromBech32(address);
  const credential = parsed.getProps().delegationPart;
  return credential
    ? Core.RewardAddress.fromCredentials(parsed.getNetworkId(), credential)
        .toAddress()
        .toBech32()
    : undefined;
}

export async function walletStakeAccount(
  address: string,
  signal?: AbortSignal,
): Promise<WalletStakeAccount | null> {
  try {
    return await blockfrostFetch<WalletStakeAccount>(
      `/api/v0/accounts/${address}`,
      { signal },
    );
  } catch (error) {
    if (error instanceof BlockfrostError && error.status === 404) return null;
    throw error;
  }
}

export function drepIdForPublicKey(key: string): string {
  if (!/^[a-f0-9]{64}$/i.test(key))
    throw new Error("Wallet returned an invalid DRep public key.");
  const hash = Core.Ed25519PublicKey.fromHex(Core.Ed25519PublicKeyHex(key))
    .hash()
    .hex();
  return Core.Cardano.DRepID.cip129FromCredential({
    type: Core.Cardano.CredentialType.KeyHash,
    hash: Core.Hash28ByteBase16(hash),
  });
}

export function groupWalletUtxos(utxos: WalletUtxo[], changeAddress: string) {
  const groups = new Map<
    string,
    {
      address: string;
      lovelace: bigint;
      utxoCount: number;
      assets: Set<string>;
    }
  >();
  for (const utxo of utxos) {
    const address = utxo.address ?? changeAddress;
    const group = groups.get(address) ?? {
      address,
      lovelace: 0n,
      utxoCount: 0,
      assets: new Set<string>(),
    };
    group.lovelace += BigInt(
      utxo.amount.find((amount) => amount.unit === "lovelace")?.quantity ?? "0",
    );
    group.utxoCount++;
    for (const amount of utxo.amount)
      if (amount.unit !== "lovelace") group.assets.add(amount.unit);
    groups.set(address, group);
  }
  return [...groups.values()].sort((a, b) =>
    a.lovelace > b.lovelace
      ? -1
      : a.lovelace < b.lovelace
        ? 1
        : a.address.localeCompare(b.address),
  );
}
