import { Core } from "@blaze-cardano/sdk";
import fixtures from "./mainnet.fixture.json";
export function rapidFixture(index = 0) {
  const row = fixtures[index];
  const value = new Core.Value(
    BigInt(row.amount.find((asset) => asset.unit === "lovelace")!.quantity),
  );
  value.setMultiasset(
    new Map(
      row.amount
        .filter((asset) => asset.unit !== "lovelace")
        .map((asset) => [Core.AssetId(asset.unit), BigInt(asset.quantity)]),
    ),
  );
  const output = new Core.TransactionOutput(
    Core.Address.fromBech32(row.address),
    value,
  );
  output.setDatum(
    Core.Datum.newInlineData(
      Core.PlutusData.fromCbor(Core.HexBlob(row.inline_datum)),
    ),
  );
  return new Core.TransactionUnspentOutput(
    new Core.TransactionInput(
      Core.TransactionId(row.tx_hash),
      BigInt(row.output_index),
    ),
    output,
  );
}
