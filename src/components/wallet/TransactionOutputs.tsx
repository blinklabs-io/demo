import { TransactionRehearsal } from "./TransactionRehearsal";
import type { Core } from "@blaze-cardano/sdk";
import { formatAda } from "../../lib/format";
import { assetName } from "../../lib/tools/transactions";
import { CopyButton } from "../explorer/CopyButton";

export function TransactionOutputs({ tx }: { tx: Core.Transaction }) {
  return (
    <>
      <TransactionRehearsal tx={tx} />
      <details>
        <summary>Outputs, including change</summary>
        <div className="tool-output-list">
          {tx
            .body()
            .outputs()
            .map((output, index) => (
              <article key={index}>
                <span className="eyebrow">Output {index + 1}</span>
                <strong>{formatAda(output.amount().coin())}</strong>
                <div className="tool-identifier">
                  <code>{output.address().toBech32()}</code>
                  <CopyButton
                    value={output.address().toBech32()}
                    label="recipient address"
                  />
                </div>
                {[...(output.amount().multiasset() ?? [])].map(
                  ([asset, quantity]) => (
                    <p key={asset}>
                      {quantity.toString()} raw units · {assetName(asset)}
                      <code>{asset}</code>
                    </p>
                  ),
                )}
              </article>
            ))}
        </div>
      </details>
    </>
  );
}
