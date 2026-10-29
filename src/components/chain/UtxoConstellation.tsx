import { useMemo, useState } from "react";
import { Core } from "@blaze-cardano/sdk";
import { Link } from "react-router";
import { fraction, fingerprint, visualColors } from "../../lib/chain/geometry";
import { inputId, assetName } from "../../lib/tools/transactions";
import { formatAda, shortenHash } from "../../lib/format";
import { CopyButton } from "../explorer/CopyButton";
interface Node {
  utxo: Core.TransactionUnspentOutput;
  id: string;
  x: number;
  y: number;
  radius: number;
  color: string;
  address: string;
}
function positions(outputs: Core.TransactionUnspentOutput[]): Node[] {
  const shown = [...outputs]
    .sort((a, b) => inputId(a).localeCompare(inputId(b)))
    .slice(0, 80);
  const addresses = [
    ...new Set(shown.map((u) => u.output().address().toBech32())),
  ].sort();
  const clusters = addresses.slice(0, 6);
  const count = Math.min(addresses.length, 7);
  const maximum = shown.reduce(
    (n, u) => (u.output().amount().coin() > n ? u.output().amount().coin() : n),
    1n,
  );
  const occupied = new Map<number, number>();
  const nodes = shown.map((u) => {
    const address = u.output().address().toBech32();
    const found = clusters.indexOf(address);
    const group = found >= 0 ? found : 6;
    const angle = -Math.PI / 2 + (group / Math.max(count, 1)) * Math.PI * 2;
    const anchor = {
      x: count === 1 ? 500 : 500 + 220 * Math.cos(angle),
      y: count === 1 ? 300 : 300 + 165 * Math.sin(angle),
    };
    const i = occupied.get(group) ?? 0;
    occupied.set(group, i + 1);
    const spread = Math.sqrt(i) * 24;
    const turn = i * 2.39996;
    return {
      utxo: u,
      id: inputId(u),
      x: anchor.x + spread * Math.cos(turn),
      y: anchor.y + spread * Math.sin(turn),
      radius: 8 + 23 * Math.sqrt(fraction(u.output().amount().coin(), maximum)),
      color: visualColors[fingerprint(address) % visualColors.length],
      address,
    };
  });
  for (let step = 0; step < 70; step++)
    for (let i = 0; i < nodes.length; i++)
      for (let j = i + 1; j < nodes.length; j++) {
        const a = nodes[i],
          b = nodes[j];
        let dx = b.x - a.x,
          dy = b.y - a.y;
        const distance = Math.hypot(dx, dy) || 0.01;
        const needed = a.radius + b.radius + 7;
        if (distance < needed) {
          if (dx === 0 && dy === 0) {
            dx = 1;
            dy = 1;
          }
          const force = ((needed - distance) / distance) * 0.25;
          a.x -= dx * force;
          a.y -= dy * force;
          b.x += dx * force;
          b.y += dy * force;
        }
      }
  return nodes.map((n) => ({
    ...n,
    x: Math.max(60 + n.radius, Math.min(940 - n.radius, n.x)),
    y: Math.max(50 + n.radius, Math.min(550 - n.radius, n.y)),
  }));
}
export function UtxoConstellation({
  outputs,
  selected,
  onToggle,
}: {
  outputs: Core.TransactionUnspentOutput[];
  selected: string[];
  onToggle: (id: string) => void;
}) {
  const nodes = useMemo(() => positions(outputs), [outputs]);
  const [inspected, setInspected] = useState<string | null>(null);
  const active = nodes.find((n) => n.id === inspected);
  const chosen = new Set(selected);
  const chosenVisible = outputs.filter((u) => chosen.has(inputId(u)));
  const total = chosenVisible.reduce(
    (n, u) => n + u.output().amount().coin(),
    0n,
  );
  return (
    <section className="chain-visual utxo-constellation">
      <header className="chain-heading">
        <div>
          <span className="eyebrow">Your spendable universe</span>
          <h2>Gather the stars.</h2>
        </div>
        <div className="constellation-count">
          <strong>{chosenVisible.length}</strong>
          <span>selected · {formatAda(total)}</span>
        </div>
      </header>
      <div className="constellation-layout">
        <svg
          viewBox="0 0 1000 600"
          aria-label="Wallet outputs grouped by address; use the checkbox list below for an alternative selection control"
          role="group"
        >
          <circle cx="500" cy="300" r="240" className="constellation-orbit" />
          <circle cx="500" cy="300" r="155" className="constellation-orbit" />
          <circle cx="500" cy="300" r="70" className="constellation-orbit" />
          {nodes.map((n) => (
            <g
              key={n.id}
              role="checkbox"
              aria-checked={chosen.has(n.id)}
              aria-label={`${n.id}: ${formatAda(n.utxo.output().amount().coin())}, ${n.utxo.output().amount().multiasset()?.size ?? 0} native assets`}
              tabIndex={0}
              onClick={() => {
                setInspected(n.id);
                onToggle(n.id);
              }}
              onKeyDown={(e) => {
                if (e.key === " " || e.key === "Enter") {
                  e.preventDefault();
                  onToggle(n.id);
                }
              }}
              onFocus={() => setInspected(n.id)}
              onMouseEnter={() => setInspected(n.id)}
              className={`constellation-node ${chosen.has(n.id) ? "chosen" : ""}`}
            >
              <circle
                cx={n.x}
                cy={n.y}
                r={n.radius + 5}
                fill="none"
                stroke={n.color}
                strokeOpacity={
                  n.utxo.output().amount().multiasset()?.size ? ".65" : "0"
                }
                strokeDasharray="3 4"
              />
              <circle
                cx={n.x}
                cy={n.y}
                r={n.radius}
                fill={n.color}
                fillOpacity={chosen.has(n.id) ? 0.85 : 0.3}
                stroke={n.color}
                strokeWidth={chosen.has(n.id) ? 3 : 1}
              />
              {chosen.has(n.id) && (
                <text
                  x={n.x}
                  y={n.y + 5}
                  textAnchor="middle"
                  fill="#071a18"
                  fontSize="18"
                >
                  ✓
                </text>
              )}
              <title>
                {n.id} · {formatAda(n.utxo.output().amount().coin())} ·{" "}
                {n.address}
              </title>
            </g>
          ))}
        </svg>
        <aside className="constellation-inspector">
          {active ? (
            <>
              <span className="eyebrow">Output under the lens</span>
              <strong>{formatAda(active.utxo.output().amount().coin())}</strong>
              <Link
                className="chain-link"
                to={`/explorer/tx/${active.utxo.input().transactionId()}`}
              >
                {shortenHash(active.utxo.input().transactionId(), 8)} #
                {active.utxo.input().index().toString()} ↗
              </Link>
              <div className="tool-identifier">
                <code>{active.address}</code>
                <CopyButton
                  value={active.address}
                  label="wallet output address"
                />
              </div>
              {[...(active.utxo.output().amount().multiasset() ?? [])]
                .slice(0, 8)
                .map(([id, n]) => (
                  <p key={id}>
                    {assetName(id)} · {n.toLocaleString()} raw units
                  </p>
                ))}
              {(active.utxo.output().amount().multiasset()?.size ?? 0) > 8 && (
                <p>
                  +{active.utxo.output().amount().multiasset()!.size - 8} other
                  assets
                </p>
              )}
              <button type="button" onClick={() => onToggle(active.id)}>
                {chosen.has(active.id) ? "Deselect output" : "Select output"}
              </button>
            </>
          ) : (
            <>
              <span className="constellation-star" aria-hidden="true">
                ✦
              </span>
              <h3>Each node is an output.</h3>
              <p>
                Inspect a star to see its value. Select the ones you want to
                consolidate.
              </p>
              <p>
                Outputs cluster by address; colors are decorative. Dotted rings
                mark native assets.
              </p>
            </>
          )}
        </aside>
      </div>
      <p className="chain-footnote">
        {nodes.length} of {outputs.length} eligible outputs shown; the checkbox
        list below includes all of them. Node area approximates ADA, with a
        minimum visible size. Selection uses only outputs exposed by your
        connected wallet.
      </p>
    </section>
  );
}
