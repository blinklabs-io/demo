import { Core } from "@blaze-cardano/sdk";
import { assertDingoNetwork, getDingoProvider } from "../dingo/utxorpc/provider";
import { hexToBytes } from "../dingo/utxorpc/bytes";
import type { MinswapUtxo } from "./data";

export async function readMinswapAssetPage(unit: string, cursor = "", signal?: AbortSignal) {
  const provider = getDingoProvider();
  await assertDingoNetwork(provider);
  signal?.throwIfAborted();
  const result = await provider.queryClient.inner.searchUtxos({
    predicate: { match: { utxoPattern: { case: "cardano", value: {
      asset: { policyId: hexToBytes(unit.slice(0, 56)), assetName: hexToBytes(unit.slice(56)) },
    } } } }, maxItems: 20, startToken: cursor,
  }, { signal });
  signal?.throwIfAborted();
  if (result.items.length > 20) throw new Error("Dingo exceeded the requested Minswap asset page size.");
  const rows: MinswapUtxo[] = result.items.map((item) => {
    if (item.parsedState.case !== "cardano" || !item.txoRef || item.txoRef.hash.length !== 32 || !item.nativeBytes.length)
      throw new Error("Dingo returned an incomplete Cardano pool output.");
    const output = Core.TransactionOutput.fromCbor(Core.HexBlob.fromBytes(item.nativeBytes));
    if (!output.amount().multiasset()?.has(Core.AssetId(unit))) throw new Error("Dingo returned an output without the requested Minswap asset.");
    return { address: output.address().toBech32(), tx_hash: Core.toHex(item.txoRef.hash), output_index: item.txoRef.index,
      inline_datum: output.datum()?.asInlineData()?.toCbor() ?? null,
      amount: [{ unit: "lovelace", quantity: String(output.amount().coin()) }, ...[...(output.amount().multiasset() ?? [])].map(([unit, quantity]) => ({ unit: String(unit), quantity: String(quantity) }))] };
  });
  if (new Set(rows.map((row) => row.tx_hash + "#" + row.output_index)).size !== rows.length || (result.nextToken && result.nextToken === cursor))
    throw new Error("Dingo repeated a Minswap asset page.");
  return { rows, nextToken: result.nextToken };
}
