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
  const dependencies = nodes.flatMap((node) => node.inputs.flatMap((port) => {
    const input = node.tx.inputs[port.index];
    const parent = byHash.get(input.hash);
    const output = parent?.outputs[input.index];
    return parent && output ? [{ from: output, to: port, parent: parent.tx.hash, child: node.tx.hash }] : [];
  }));
  return { nodes, dependencies, width, height: Math.max(220, Math.ceil(nodes.length / columns) * 220) };
}
