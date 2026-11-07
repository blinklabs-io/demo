import { expect, it } from "vitest";
import { mempoolGraph } from "./mempoolGraph";
import type { PendingTx } from "../dingo/utxorpc/streaming";

const tx = (hash: string, parent: string): PendingTx => ({ hash, inputs: [{ hash: parent, index: 0 }], outputs: [{ address: "address", lovelace: 1000000n }], inputCount: 1, outputCount: 1, totalOutputLovelace: 1000000n, fee: 200000n, seenAt: 1 });
it.each([true, false])("connects real pending outpoints with a responsive layout: compact %s", (compact) => {
  const transactions = [tx("parent", "confirmed"), tx("child", "parent")];
  const graph = mempoolGraph(transactions, compact);
  expect(graph.dependencies).toEqual([{ from: graph.nodes[0].outputs[0], to: graph.nodes[1].inputs[0], parent: "parent", child: "child" }]);
  expect(graph.width).toBe(compact ? 360 : 1080);
  expect(graph.height).toBe(compact ? 440 : 220);
  expect(mempoolGraph([transactions[1]], compact).dependencies).toHaveLength(0);
});
it("bounds drawn ports while preserving all transaction inputs and outputs", () => {
  const transaction = tx("many", "confirmed");
  transaction.inputs = Array.from({ length: 50 }, (_, index) => ({ hash: "confirmed", index }));
  transaction.inputCount = 50;
  const graph = mempoolGraph([transaction], false);
  expect(graph.nodes[0].inputs).toHaveLength(6);
  expect(graph.nodes[0].tx.inputs).toHaveLength(50);
});
