import { Core } from "@blaze-cardano/sdk";
import { blockfrostFetch, BlockfrostError } from "./blockfrost";
import { bytesToHex } from "./utxorpc/bytes";

const ORIGINAL_POLICY =
  "f0ff48bbb7bbe9d59a40f1ce90e9e9d0ff5002ec48f232b49ca0fb9a";
const text = new TextEncoder();
interface Holder {
  address: string;
  quantity: string;
}
interface Utxo {
  inline_datum: string | null;
  data_hash: string | null;
}

async function holders(asset: string, signal?: AbortSignal): Promise<Holder[]> {
  try {
    const rows = await blockfrostFetch<Holder[]>(
      `/api/v0/assets/${asset}/addresses?count=2`,
      { signal },
    );
    return rows.filter((row) => BigInt(row.quantity) > 0n);
  } catch (error) {
    if (error instanceof BlockfrostError && error.status === 404) return [];
    throw error;
  }
}

async function datumFor(
  asset: string,
  owner: string,
  signal?: AbortSignal,
): Promise<Core.PlutusData> {
  const rows = await blockfrostFetch<Utxo[]>(
    `/api/v0/addresses/${encodeURIComponent(owner)}/utxos/${asset}?count=2`,
    { signal },
  );
  if (rows.length !== 1)
    throw new Error("Handle datum must belong to exactly one unspent output.");
  let cbor = rows[0].inline_datum;
  if (!cbor && rows[0].data_hash)
    cbor = (
      await blockfrostFetch<{ cbor: string }>(
        `/api/v0/scripts/datum/${rows[0].data_hash}/cbor`,
        { signal },
      )
    ).cbor;
  if (!cbor) throw new Error("The Handle's on-chain datum is unavailable.");
  return Core.PlutusData.fromCbor(Core.HexBlob(cbor));
}

function listItems(list: Core.PlutusList): Core.PlutusData[] {
  return Array.from({ length: list.getLength() }, (_, i) => list.get(i));
}

function virtualAddress(data: Core.PlutusData, depth = 0): string | undefined {
  if (depth > 12) throw new Error("Handle datum nesting is too deep.");
  const map = data.asMap();
  if (map) {
    const resolved = map
      .get(Core.PlutusData.newBytes(text.encode("resolved_addresses")))
      ?.asMap();
    const ada = resolved
      ?.get(Core.PlutusData.newBytes(text.encode("ada")))
      ?.asBoundedBytes();
    if (ada) {
      const decoded = new TextDecoder().decode(ada);
      return decoded.startsWith("addr")
        ? Core.Address.fromBech32(decoded).toBech32()
        : Core.Address.fromBytes(Core.HexBlob(bytesToHex(ada))).toBech32();
    }
    for (const key of listItems(map.getKeys())) {
      const value = map.get(key);
      if (value) {
        const address = virtualAddress(value, depth + 1);
        if (address) return address;
      }
    }
  }
  const list = data.asList() ?? data.asConstrPlutusData()?.getData();
  if (list)
    for (const value of listItems(list)) {
      const address = virtualAddress(value, depth + 1);
      if (address) return address;
    }
  return undefined;
}

async function policies(slot: number, signal?: AbortSignal): Promise<string[]> {
  const registryAsset =
    ORIGINAL_POLICY + bytesToHex(text.encode("handle_policies"));
  const registry = await holders(registryAsset, signal);
  // The original policy predates the optional on-chain policy registry.
  if (!registry.length) return [ORIGINAL_POLICY];
  if (registry.length !== 1 || registry[0].quantity !== "1")
    throw new Error("The Handle policy registry is ambiguous.");
  const datum = await datumFor(registryAsset, registry[0].address, signal);
  const map = (datum.asList()?.get(0) ?? datum).asMap();
  if (!map) throw new Error("Invalid Handle policy registry datum.");
  const active: string[] = [];
  for (const key of listItems(map.getKeys())) {
    const bytes = key.asBoundedBytes();
    const tuple = map.get(key)?.asList();
    if (!bytes || bytes.length !== 28 || !tuple || tuple.getLength() !== 3)
      throw new Error("Invalid Handle policy registry entry.");
    const first = tuple.get(0).asInteger();
    const sunset = tuple.get(2).asInteger();
    if (first === undefined || sunset === undefined)
      throw new Error("Invalid Handle policy registry slots.");
    if (first <= BigInt(slot) && (sunset <= 0n || BigInt(slot) < sunset))
      active.push(bytesToHex(bytes));
  }
  return active;
}

export async function resolveHandle(
  raw: string,
  signal?: AbortSignal,
): Promise<string | null> {
  const handle = raw.replace(/^\$/, "").toLowerCase();
  if (!/^[a-z0-9_.@-]+$/.test(handle) || text.encode(handle).length > 32)
    throw new Error("Enter a valid ADA Handle.");
  const name = bytesToHex(text.encode(handle));
  const [tip, genesis] = await Promise.all([
    blockfrostFetch<{ slot: number }>("/api/v0/blocks/latest", { signal }),
    blockfrostFetch<{ network_magic: number }>("/api/v0/genesis", { signal }),
  ]);
  const activePolicies = await policies(tip.slot, signal);
  const candidates: string[] = [];
  if (name.length <= 56) {
    for (const policy of activePolicies) {
      const tokenHolders = await holders(policy + "000de140" + name, signal);
      if (
        tokenHolders.length > 1 ||
        tokenHolders.some((row) => row.quantity !== "1")
      )
        throw new Error("This Handle has ambiguous on-chain ownership.");
      candidates.push(...tokenHolders.map((row) => row.address));
    }
  }
  if (!candidates.length && handle.includes("@") && name.length <= 56) {
    for (const policy of activePolicies) {
      const asset = policy + "00000000" + name;
      const tokenHolders = await holders(asset, signal);
      if (
        tokenHolders.length > 1 ||
        tokenHolders.some((row) => row.quantity !== "1")
      )
        throw new Error(
          "This virtual Handle has ambiguous on-chain ownership.",
        );
      for (const row of tokenHolders) {
        const address = virtualAddress(
          await datumFor(asset, row.address, signal),
        );
        if (!address)
          throw new Error("This virtual Handle has no ADA resolution address.");
        candidates.push(address);
      }
    }
  }
  if (!candidates.length && activePolicies.includes(ORIGINAL_POLICY)) {
    const classic = await holders(ORIGINAL_POLICY + name, signal);
    if (classic.length > 1 || classic.some((row) => row.quantity !== "1"))
      throw new Error("This Handle has ambiguous on-chain ownership.");
    candidates.push(...classic.map((row) => row.address));
  }
  if (candidates.length > 1)
    throw new Error("Multiple active Handle tokens match this name.");
  if (!candidates.length) return null;
  const address = Core.Address.fromBech32(candidates[0]);
  const expectedNetwork = genesis.network_magic === 764824073 ? 1 : 0;
  if (address.getNetworkId() !== expectedNetwork)
    throw new Error(
      "The resolved Handle address belongs to a different network.",
    );
  return address.toBech32();
}
