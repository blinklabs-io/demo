import type { PendingTx } from "../dingo/utxorpc/streaming";

export const MEMPOOL_GRAPH_PAGE_SIZE = 12;
const PORTS = 6;
export function mempoolGraph(transactions: PendingTx[], compact: boolean) {
  const columns = compact ? 1 : 3;
  const width = columns * 360;
  const nodes = transactions.map((tx, index) => {
    const x = (index % columns) * 360 + 180;
    const y = Math.floor(index / columns) * 220 + 110;
    const ports = (count: number, left: boolean) => Array.from({ length: Math.min(count, PORTS) }, (_, i) => {
      const angle = ((i + 1) / (Math.min(count, PORTS) + 1) - 0.5) * Math.PI * 0.8;
      return { x: x + (left ? -1 : 1) * Math.cos(angle) * 120, y: y + Math.sin(angle) * 100, index: i };
    });
    return { tx, x, y, inputs: ports(tx.inputs.length, true), outputs: ports(tx.outputs.length, false) };
  });
  const byHash = new Map(nodes.map((node) => [node.tx.hash, node]));
  const dependencies = nodes.flatMap((node) => node.tx.inputs.flatMap((input, index) => {
    const parent = byHash.get(input.hash);
    if (!parent || input.index < 0 || input.index >= parent.tx.outputs.length) return [];
    return [{ from: parent.outputs[input.index] ?? { x: parent.x, y: parent.y }, to: node.inputs[index] ?? { x: node.x, y: node.y }, parent: parent.tx.hash, child: node.tx.hash }];
  }));
  return { nodes, dependencies, width, height: Math.max(220, Math.ceil(nodes.length / columns) * 220) };
}
