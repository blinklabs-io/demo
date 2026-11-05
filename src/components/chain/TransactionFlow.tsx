import { useId, useMemo, useState } from "react";
import { Core } from "@blaze-cardano/sdk";
import { Link } from "../NetworkLink";
import { fraction } from "../../lib/chain/geometry";
import { formatAda, shortenHash } from "../../lib/format";
import { CopyButton } from "../explorer/CopyButton";
import "./transaction-flow.css";
import { assetName } from "../../lib/tools/transactions";
interface Utxo {
  address: string;
  tx_hash?: string;
  output_index: number;
  amount: { unit: string; quantity: string }[];
  collateral: boolean;
  reference?: boolean;
}
interface Summary {
  hash: string;
  fees: string;
  deposit: string;
  treasury_donation: string;
  valid_contract: boolean;
}
interface FlowNode {
  id: string;
  label: string;
  value: bigint;
  href?: string;
  entries?: number;
}
function byAddress(rows: FlowNode[]) {
  const groups = new Map<string, FlowNode>();
  for (const row of rows) {
    const key = row.href ?? row.id;
    const previous = groups.get(key);
    groups.set(
      key,
      previous
        ? {
            ...previous,
            value: previous.value + row.value,
            entries: (previous.entries ?? 1) + 1,
          }
        : { ...row, entries: 1 },
    );
  }
  return [...groups.values()].sort((a, b) =>
    a.value === b.value ? 0 : a.value > b.value ? -1 : 1,
  );
}
function grouped(rows: FlowNode[]) {
  if (rows.length <= 5) return rows;
  return [
    ...rows.slice(0, 4),
    {
      id: "other",
      label: `${rows.length - 4} other value entries`,
      value: rows.slice(4).reduce((n, r) => n + r.value, 0n),
    },
  ];
}
export function TransactionFlow({
  summary,
  inputs,
  outputs,
  cbor,
  error,
}: {
  summary: Summary;
  inputs: Utxo[];
  outputs: Utxo[];
  cbor?: string;
  error?: unknown;
}) {
  const [unit, setUnit] = useState("lovelace");
  const [aggregate, setAggregate] = useState(true);
  const [expanded, setExpanded] = useState(false);
  const [focus, setFocus] = useState<string | null>(null);
  const uid = useId();
  const parsed = useMemo(() => {
    if (!cbor) return null;
    try {
      const tx = Core.Transaction.fromCbor(Core.TxCBOR(cbor));
      if (tx.getId() !== summary.hash)
        throw new Error("Transaction CBOR hash mismatch.");
      return { body: tx.body() };
    } catch (e) {
      return {
        error:
          e instanceof Error ? e.message : "Cannot decode transaction CBOR.",
      };
    }
  }, [cbor, summary.hash]);
  const units = [
    ...new Set([
      "lovelace",
      ...inputs.flatMap((u) => u.amount.map((a) => a.unit)),
      ...outputs.flatMap((u) => u.amount.map((a) => a.unit)),
      ...(parsed?.body ? [...(parsed.body.mint()?.keys() ?? [])] : []),
    ]),
  ];
  const active = units.includes(unit) ? unit : "lovelace";
  const format = (n: bigint) =>
    active === "lovelace" ? formatAda(n) : `${n.toLocaleString()} raw units`;
  if (error || (parsed && "error" in parsed))
    return (
      <section className="chain-visual">
        <h2>Transaction flow</h2>
        <p className="chain-error">
          {error instanceof Error
            ? error.message
            : parsed && "error" in parsed
              ? parsed.error
              : "Flow data unavailable."}
        </p>
      </section>
    );
  if (!parsed)
    return (
      <section className="chain-visual" role="status">
        Preparing transaction flow…
      </section>
    );
  const valid = summary.valid_contract;
  const consumed = inputs.filter(
    (u) => !u.reference && (valid ? !u.collateral : u.collateral),
  );
  const produced = valid
    ? outputs.filter((u) => !u.collateral)
    : parsed.body.collateralReturn()
      ? [
          {
            address: parsed.body.collateralReturn()!.address().toBech32(),
            tx_hash: summary.hash,
            output_index: parsed.body.outputs().length,
            collateral: true,
            amount: [
              {
                unit: "lovelace",
                quantity: parsed.body
                  .collateralReturn()!
                  .amount()
                  .coin()
                  .toString(),
              },
              ...[
                ...(parsed.body.collateralReturn()!.amount().multiasset() ??
                  []),
              ].map(([unit, n]) => ({ unit, quantity: n.toString() })),
            ],
          },
        ]
      : [];
  const amount = (u: { amount: { unit: string; quantity: string }[] }) =>
    BigInt(u.amount.find((a) => a.unit === active)?.quantity ?? "0");
  const sources: FlowNode[] = consumed
    .map((u, i) => ({
      id: `input-${i}`,
      label: u.address,
      value: amount(u),
      href: `/explorer/address/${u.address}`,
    }))
    .filter((n) => n.value > 0n);
  const sinks: FlowNode[] = produced
    .map((u, i) => ({
      id: `output-${i}`,
      label: u.address,
      value: amount(u),
      href: `/explorer/address/${u.address}`,
    }))
    .filter((n) => n.value > 0n);
  if (valid && active === "lovelace") {
    const withdrawal = [...(parsed.body.withdrawals()?.values() ?? [])].reduce(
      (n, v) => n + v,
      0n,
    );
    if (withdrawal > 0n)
      sources.push({
        id: "rewards",
        label: "Withdrawn rewards",
        value: withdrawal,
      });
    const deposit = BigInt(summary.deposit);
    if (deposit < 0n)
      sources.push({
        id: "refund",
        label: "Deposit refunds (net)",
        value: -deposit,
      });
    else if (deposit > 0n)
      sinks.push({ id: "deposit", label: "Deposits (net)", value: deposit });
    const fee = BigInt(summary.fees);
    if (fee > 0n) sinks.push({ id: "fees", label: "Network fee", value: fee });
    const donation = BigInt(summary.treasury_donation);
    if (donation > 0n)
      sinks.push({
        id: "treasury",
        label: "Treasury donation",
        value: donation,
      });
  } else if (valid) {
    const minted = parsed.body.mint()?.get(Core.AssetId(active)) ?? 0n;
    if (minted > 0n)
      sources.push({ id: "mint", label: "Minted", value: minted });
    else if (minted < 0n)
      sinks.push({ id: "burn", label: "Burned", value: -minted });
  } else if (active === "lovelace") {
    const collected =
      sources.reduce((n, r) => n + r.value, 0n) -
      sinks.reduce((n, r) => n + r.value, 0n);
    if (collected > 0n)
      sinks.push({
        id: "collateral-fee",
        label: "Collected collateral",
        value: collected,
      });
  }
  const sourceRows = aggregate ? byAddress(sources) : sources;
  const sinkRows = aggregate ? byAddress(sinks) : sinks;
  const from = expanded ? sourceRows : grouped(sourceRows),
    to = expanded ? sinkRows : grouped(sinkRows);
  const selected = [
    ...sourceRows.map((n) => ({ ...n, side: "Source" })),
    ...sinkRows.map((n) => ({ ...n, side: "Destination" })),
  ].find((n) => `${n.side}:${n.id}` === focus);
  const totalIn = sources.reduce((n, r) => n + r.value, 0n),
    totalOut = sinks.reduce((n, r) => n + r.value, 0n);
  const max = totalIn > totalOut ? totalIn : totalOut;
  const rows = Math.max(from.length, to.length, 3),
    height = rows * 62 + 70;
  return (
    <section className="chain-visual transaction-river">
      <header className="chain-heading">
        <div>
          <span className="eyebrow">Follow the value</span>
          <h2>One transaction. Many paths.</h2>
        </div>
        <label className="chain-select">
          Value
          <select
            aria-label="Transaction flow asset"
            value={active}
            onChange={(e) => setUnit(e.target.value)}
          >
            {units.map((u) => (
              <option key={u} value={u}>
                {u === "lovelace"
                  ? "ADA"
                  : assetName(u) + " · " + u.slice(0, 8)}
              </option>
            ))}
          </select>
        </label>
      </header>
      <div className="flow-controls">
        <label>
          <input
            type="checkbox"
            checked={aggregate}
            onChange={(e) => {
              setAggregate(e.target.checked);
              setFocus(null);
            }}
          />{" "}
          Group repeated addresses
        </label>
        {(sourceRows.length > 5 || sinkRows.length > 5) && (
          <button
            type="button"
            aria-expanded={expanded}
            onClick={() => setExpanded(!expanded)}
          >
            {expanded
              ? "Show main branches"
              : `Show all ${sourceRows.length + sinkRows.length} branches`}
          </button>
        )}
        <span>Select a branch to inspect its value.</span>
      </div>
      <div className="river-totals">
        <div>
          <span>Sources</span>
          <strong>{format(totalIn)}</strong>
        </div>
        <div>
          <span>
            {valid
              ? "Applied to the ledger"
              : "Collateral applied; scripts failed"}
          </span>
          <strong>{totalIn === totalOut ? "Balanced" : "Totals differ"}</strong>
        </div>
        <div>
          <span>Destinations</span>
          <strong>{format(totalOut)}</strong>
        </div>
      </div>
      <div className="river-mobile">
        {[
          { name: "Sources", nodes: from },
          { name: "Destinations", nodes: to },
        ].map((group, index) => (
          <div key={group.name}>
            {index === 1 && (
              <div className="river-mobile-pool">
                <span>↓</span>
                <strong>Shared value pool</strong>
                <span>↓</span>
              </div>
            )}
            <h3>{group.name}</h3>
            <div className="river-mobile-nodes">
              {group.nodes.map((n) => (
                <div key={n.id} className="river-mobile-node">
                  <i
                    aria-hidden="true"
                    style={{
                      width: `${Math.max(1, 100 * fraction(n.value, max))}%`,
                    }}
                  />
                  <button
                    type="button"
                    aria-pressed={
                      focus ===
                      `${index === 0 ? "Source" : "Destination"}:${n.id}`
                    }
                    onClick={() => {
                      if (n.id === "other") setExpanded(true);
                      else
                        setFocus(
                          `${index === 0 ? "Source" : "Destination"}:${n.id}`,
                        );
                    }}
                  >
                    {n.href ? shortenHash(n.label, 6) : n.label}
                  </button>
                  <strong>{format(n.value)}</strong>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
      <svg
        className="river-svg"
        viewBox={`0 0 1000 ${height}`}
        role="group"
        aria-labelledby={`${uid}-title`}
      >
        <title id={`${uid}-title`}>
          Transaction sources and destinations through a shared value pool;
          individual input-to-output attribution is not implied.
        </title>
        <defs>
          <linearGradient id={`${uid}-fill`}>
            <stop stopColor="#30d4b2" />
            <stop offset="1" stopColor="#a99bff" />
          </linearGradient>
        </defs>
        <rect
          x="454"
          y="30"
          width="92"
          height={height - 60}
          rx="24"
          fill={`url(#${uid}-fill)`}
          opacity=".17"
          stroke="#70dfcf"
        />
        <text
          x="500"
          y={height / 2 - 8}
          textAnchor="middle"
          fill="#d6fff5"
          fontSize="16"
        >
          VALUE
        </text>
        <text
          x="500"
          y={height / 2 + 15}
          textAnchor="middle"
          fill="#96c6bc"
          fontSize="12"
        >
          POOL
        </text>
        {[
          { nodes: from, left: true },
          { nodes: to, left: false },
        ].map(({ nodes, left }) =>
          nodes.map((n, i) => {
            const y =
              45 + ((i + 0.5) * (height - 90)) / Math.max(nodes.length, 1);
            const thickness = Math.max(2, 38 * fraction(n.value, max));
            const x = left ? 20 : 690;
            const node = (
              <>
                <rect
                  x={x}
                  y={y - 24}
                  width="290"
                  height="48"
                  rx="10"
                  fill={left ? "#123a33" : "#2c2448"}
                  stroke={left ? "#387d6d" : "#66558d"}
                />
                <text x={x + 14} y={y - 4} fill="#b9d5df" fontSize="13">
                  {n.href ? shortenHash(n.label, 6) : n.label}
                </text>
                <text x={x + 14} y={y + 14} fill="#f0fff9" fontSize="14">
                  {format(n.value)}
                </text>
                <title>
                  {n.label}: {format(n.value)}
                </title>
              </>
            );
            return (
              <g key={`${left}:${n.id}`}>
                <path
                  d={
                    left
                      ? `M310 ${y} C390 ${y} 390 ${height / 2} 454 ${height / 2}`
                      : `M546 ${height / 2} C610 ${height / 2} 610 ${y} 690 ${y}`
                  }
                  fill="none"
                  stroke={left ? "#35dcb9" : "#af9eff"}
                  strokeWidth={thickness}
                  opacity={
                    !selected ||
                    focus === `${left ? "Source" : "Destination"}:${n.id}`
                      ? ".65"
                      : ".12"
                  }
                />
                <g
                  role="button"
                  tabIndex={0}
                  className="flow-branch"
                  aria-label={`Inspect ${left ? "source" : "destination"} ${n.label}: ${format(n.value)}`}
                  aria-pressed={
                    focus === `${left ? "Source" : "Destination"}:${n.id}`
                  }
                  onClick={() => {
                    if (n.id === "other") setExpanded(true);
                    else setFocus(`${left ? "Source" : "Destination"}:${n.id}`);
                  }}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" || event.key === " ") {
                      event.preventDefault();
                      if (n.id === "other") setExpanded(true);
                      else
                        setFocus(`${left ? "Source" : "Destination"}:${n.id}`);
                    }
                  }}
                >
                  {node}
                </g>
              </g>
            );
          }),
        )}
      </svg>
      {selected && (
        <aside className="flow-inspector" aria-label="Selected flow branch">
          <div>
            <span className="eyebrow">
              {selected.side} · {selected.entries ?? 1} value{" "}
              {(selected.entries ?? 1) === 1 ? "entry" : "entries"}
            </span>
            <strong>{format(selected.value)}</strong>
          </div>
          <div className="flow-inspector-address">
            <code>{selected.label}</code>
            {selected.href && (
              <CopyButton value={selected.label} label="flow address" />
            )}
          </div>
          {selected.href && <Link to={selected.href}>Explore address →</Link>}
          <button type="button" onClick={() => setFocus(null)}>
            Clear selection
          </button>
        </aside>
      )}
      <details className="chain-records">
        <summary>All sources &amp; destinations · {active}</summary>
        {[
          { name: "Source", nodes: sources },
          { name: "Destination", nodes: sinks },
        ].map((group) =>
          group.nodes.map((n) => (
            <div className="flow-record" key={`${group.name}:${n.id}`}>
              <span>{group.name}</span>
              {n.href ? (
                <Link to={n.href}>
                  <code>{n.label}</code>
                </Link>
              ) : (
                <span>{n.label}</span>
              )}
              <strong>{format(n.value)}</strong>
            </div>
          )),
        )}
      </details>
      <p className="chain-footnote">
        Widths show relative value. Inputs enter a shared pool; no line assigns
        a particular input to a particular output. Reference inputs and{" "}
        {valid
          ? "unused collateral are excluded."
          : "ordinary transaction effects are excluded."}
        {totalIn !== totalOut &&
          ` Unaccounted difference: ${format(totalIn - totalOut)}.`}
      </p>
    </section>
  );
}
