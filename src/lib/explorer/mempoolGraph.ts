import type { PendingTx } from "../dingo/utxorpc/streaming";

export const MEMPOOL_GRAPH_PAGE_SIZE = 12;

export function reconcileMempoolSlots(transactions: PendingTx[], previous: Map<string, number>) {
  const hashes = new Set(transactions.map((tx) => tx.hash));
  if (hashes.size === previous.size && [...hashes].every((hash) => previous.has(hash))) return previous;
  const next = new Map([...previous].filter(([hash]) => hashes.has(hash)));
  const used = new Set(next.values());
  let slot = 0;
  for (const tx of transactions) {
    if (next.has(tx.hash)) continue;
    while (used.has(slot)) slot++;
    next.set(tx.hash, slot);
    used.add(slot);
  }
  return next;
}

export function mempoolOverview(transactions: PendingTx[], slots: Map<string, number>) {
  const capacity = Math.max(64, 2 ** Math.ceil(Math.log2(Math.max(1, ...slots.values()) + 1)));
  const maximumFee = transactions.reduce((max, tx) => tx.fee > max ? tx.fee : max, 0n);
  const nodes = transactions.map((tx) => {
    const slot = slots.get(tx.hash);
    if (slot === undefined) throw new Error("Missing mempool layout slot.");
    const angle = slot * Math.PI * (3 - Math.sqrt(5));
    const radius = Math.sqrt((slot + 0.5) / capacity);
    const weight = maximumFee > 0n ? Number(tx.fee * 1000n / maximumFee) / 1000 : 0;
    return { tx, x: 500 + Math.cos(angle) * radius * 465, y: 300 + Math.sin(angle) * radius * 265, radius: 4 + Math.sqrt(weight) * 3 };
  });
  const byHash = new Map(nodes.map((node) => [node.tx.hash, node]));
  const dependencies = nodes.flatMap((node) => node.tx.inputs.flatMap((input) => {
    const parent = byHash.get(input.hash);
    return parent && input.index >= 0 && input.index < parent.tx.outputs.length
      ? [{ from: parent, to: node }] : [];
  }));
  return { nodes, dependencies, maximumFee };
}
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
