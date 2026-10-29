import { useId, useState } from "react";
import { useInfiniteQuery } from "@tanstack/react-query";
import { Link } from "react-router";
import { blockfrostFetch } from "../../lib/dingo/blockfrost";
import { fraction } from "../../lib/chain/geometry";
import { formatAda } from "../../lib/format";
import { PoolIdentity } from "../explorer/PoolIdentity";
interface Reward {
  epoch: number;
  amount: string;
  pool_id: string;
  type: string;
}
interface Delegation {
  active_epoch: number;
  pool_id: string;
  tx_hash: string;
  block_time: number;
}
interface Registration {
  tx_hash: string;
  action: string;
  deposit: string;
  block_time: number;
}
interface Withdrawal {
  tx_hash: string;
  amount: string;
  block_time: number;
}
function useHistory<T>(stake: string, kind: string, enabled: boolean) {
  return useInfiniteQuery({
    queryKey: ["dingo", "account", stake, "journey", kind],
    enabled,
    initialPageParam: 1,
    retry: false,
    queryFn: ({ pageParam, signal }) =>
      blockfrostFetch<T[]>(
        `/api/v0/accounts/${stake}/${kind}?page=${pageParam}&count=100&order=desc`,
        { signal },
      ),
    getNextPageParam: (last, pages) =>
      last.length === 100 ? pages.length + 1 : undefined,
  });
}
export function StakeJourney({ stakeAddress }: { stakeAddress: string }) {
  return <Journey key={stakeAddress} stake={stakeAddress} />;
}
function Journey({ stake }: { stake: string }) {
  const [open, setOpen] = useState(false),
    [selected, setSelected] = useState<number | null>(null),
    [range, setRange] = useState("recent");
  const uid = useId();
  const rewards = useHistory<Reward>(stake, "rewards", open),
    delegations = useHistory<Delegation>(stake, "delegations", open),
    registrations = useHistory<Registration>(stake, "registrations", open),
    withdrawals = useHistory<Withdrawal>(stake, "withdrawals", open);
  const rewardRows = rewards.data?.pages.flat() ?? [],
    delegationRows = delegations.data?.pages.flat() ?? [];
  const totals = new Map<number, bigint>();
  for (const r of rewardRows)
    totals.set(r.epoch, (totals.get(r.epoch) ?? 0n) + BigInt(r.amount));
  const allEpochs = [
    ...new Set([
      ...totals.keys(),
      ...delegationRows.map((d) => d.active_epoch),
    ]),
  ].sort((a, b) => a - b);
  const cutoff = (allEpochs.at(-1) ?? 0) - 29;
  const epochs = allEpochs.filter((e) => range === "all" || e >= cutoff);
  const first = epochs[0] ?? 0,
    last = epochs.at(-1) ?? first,
    span = Math.max(1, last - first);
  const hitWidth = Math.min(20, 920 / span),
    barWidth = Math.min(18, 736 / span);
  const maximum = [...totals.values()].reduce((n, v) => (v > n ? v : n), 1n);
  const inspected =
    selected !== null && epochs.includes(selected) ? selected : epochs.at(-1);
  const dated = [
    ...(registrations.data?.pages.flat() ?? []).map((r, i) => ({
      id: `r:${r.tx_hash}:${i}`,
      hash: r.tx_hash,
      time: r.block_time,
      label: r.action,
      value: `Deposit ${formatAda(BigInt(r.deposit))}`,
      kind: "registration",
    })),
    ...(withdrawals.data?.pages.flat() ?? []).map((r, i) => ({
      id: `w:${r.tx_hash}:${i}`,
      hash: r.tx_hash,
      time: r.block_time,
      label: "Rewards withdrawn",
      value: formatAda(BigInt(r.amount)),
      kind: "withdrawal",
    })),
  ].sort((a, b) => b.time - a.time);
  const sources = [
    { name: "Rewards", query: rewards },
    { name: "Delegations", query: delegations },
    { name: "Registrations", query: registrations },
    { name: "Withdrawals", query: withdrawals },
  ];
  return (
    <section className="chain-visual stake-journey">
      <header className="chain-heading">
        <div>
          <span className="eyebrow">The story of your stake</span>
          <h2>Delegate. Earn. Repeat.</h2>
        </div>
        {open && (
          <label className="chain-select">
            Window
            <select
              value={range}
              onChange={(e) => setRange(e.target.value)}
              aria-label="Stake journey epoch window"
            >
              <option value="recent">
                Last 30 epochs with loaded activity
              </option>
              <option value="all">All loaded epochs</option>
            </select>
          </label>
        )}
        {!open && (
          <button onClick={() => setOpen(true)}>Explore stake journey</button>
        )}
      </header>
      {!open ? (
        <div className="journey-teaser" aria-hidden="true">
          <span>
            ◎<small>Register</small>
          </span>
          <i />
          <span>
            ◈<small>Delegate</small>
          </span>
          <i />
          <span>
            ✦<small>Earn</small>
          </span>
          <i />
          <span>
            ↗<small>Withdraw</small>
          </span>
        </div>
      ) : (
        <>
          <div className="journey-sources">
            {sources.map(({ name, query }) => (
              <div key={name}>
                <strong>{name}</strong>
                <span>
                  {query.data?.pages.flat().length ?? 0} records
                  {query.hasNextPage ? " · partial" : ""}
                </span>
                {query.isPending && <span role="status">Loading…</span>}
                {query.error && (
                  <span className="chain-error" role="alert">
                    {query.error.message}
                  </span>
                )}
                {query.error ? (
                  <button
                    onClick={() =>
                      void (query.hasNextPage
                        ? query.fetchNextPage()
                        : query.refetch())
                    }
                  >
                    Retry {name.toLowerCase()}
                  </button>
                ) : (
                  query.hasNextPage && (
                    <button
                      disabled={query.isFetching}
                      onClick={() => void query.fetchNextPage()}
                    >
                      {query.isFetching ? "Loading…" : "Load next 100"}
                    </button>
                  )
                )}
              </div>
            ))}
          </div>
          {epochs.length > 0 ? (
            <>
              <div className="journey-chart">
                <svg
                  viewBox="0 0 1000 300"
                  role="group"
                  aria-labelledby={`${uid}-title`}
                >
                  <title id={`${uid}-title`}>
                    Rewards by earned epoch and delegation effective epochs. Use
                    epoch markers to inspect exact values.
                  </title>
                  <defs>
                    <linearGradient
                      id={`${uid}-reward`}
                      x1="0"
                      x2="0"
                      y1="1"
                      y2="0"
                    >
                      <stop stopColor="#13594f" />
                      <stop offset="1" stopColor="#57efc2" />
                    </linearGradient>
                  </defs>
                  <path d="M40 230H960" stroke="#48626b" />
                  {epochs.map((epoch) => {
                    const x = 40 + ((epoch - first) / span) * 920,
                      value = totals.get(epoch) ?? 0n,
                      height = 155 * fraction(value, maximum),
                      delegated = delegationRows.some(
                        (d) => d.active_epoch === epoch,
                      );
                    return (
                      <g
                        key={epoch}
                        tabIndex={0}
                        role="button"
                        aria-label={`Epoch ${epoch}: ${totals.has(epoch) ? formatAda(value) + " loaded rewards" : "no reward records loaded"}${delegated ? ", delegation effective" : ""}`}
                        onClick={() => setSelected(epoch)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" || e.key === " ") {
                            e.preventDefault();
                            setSelected(epoch);
                          }
                        }}
                        className={
                          epoch === inspected
                            ? "journey-epoch selected"
                            : "journey-epoch"
                        }
                      >
                        <rect
                          x={x - hitWidth / 2}
                          y="45"
                          width={hitWidth}
                          height="204"
                          fill="transparent"
                        />
                        <rect
                          x={x - barWidth / 2}
                          y={230 - height}
                          width={barWidth}
                          height={Math.max(value > 0n ? 2 : 0, height)}
                          rx="3"
                          fill={`url(#${uid}-reward)`}
                          pointerEvents="none"
                        />
                        <circle
                          cx={x}
                          cy="230"
                          r={delegated ? 8 : 3}
                          pointerEvents="none"
                          fill={delegated ? "#bbacff" : "#638e90"}
                        />
                        {(epoch === first ||
                          epoch === last ||
                          epoch === inspected) && (
                          <text
                            x={x}
                            y="274"
                            textAnchor="middle"
                            pointerEvents="none"
                            fill="#c3d7df"
                            fontSize="15"
                          >
                            {epoch}
                          </text>
                        )}
                        <title>
                          Epoch {epoch}:{" "}
                          {totals.has(epoch)
                            ? formatAda(value) + " loaded rewards"
                            : "no reward records loaded"}
                          {delegated ? " · delegation effective" : ""}
                        </title>
                      </g>
                    );
                  })}
                </svg>
              </div>
              {inspected !== undefined && (
                <div className="journey-inspector">
                  <div>
                    <span className="eyebrow">
                      Loaded rewards · earned in epoch {inspected}
                    </span>
                    <strong>
                      {totals.has(inspected)
                        ? formatAda(totals.get(inspected)!)
                        : "No reward records loaded"}
                    </strong>
                    <Link to={`/explorer/epoch/${inspected}`}>
                      Explore epoch ↗
                    </Link>
                  </div>
                  <div>
                    {delegationRows
                      .filter((d) => d.active_epoch === inspected)
                      .map((d, i) => (
                        <div key={`${d.tx_hash}:${i}`}>
                          <span>
                            Delegation effective in epoch {d.active_epoch}
                          </span>
                          <PoolIdentity poolId={d.pool_id} />
                          <Link to={`/explorer/tx/${d.tx_hash}`}>
                            Delegation transaction ↗
                          </Link>
                        </div>
                      ))}
                    {rewardRows
                      .filter((r) => r.epoch === inspected)
                      .map((r, i) => (
                        <p key={i}>
                          {r.type}: {formatAda(BigInt(r.amount))}
                          {r.pool_id && (
                            <>
                              {" "}
                              ·{" "}
                              <Link to={`/explorer/pool/${r.pool_id}`}>
                                Reward pool ↗
                              </Link>
                            </>
                          )}
                        </p>
                      ))}
                  </div>
                </div>
              )}
              <p className="chain-footnote">
                Horizontal distance represents epochs. Green bars are rewards
                earned in that epoch, not the epoch they became withdrawable.
                Purple markers show delegation effective epochs, not transaction
                submission dates. Only loaded records in the selected window are
                plotted; all loaded events remain in the list.
              </p>
            </>
          ) : (
            !rewards.isPending &&
            !delegations.isPending && (
              <p className="chain-empty">
                No reward or delegation records loaded.
              </p>
            )
          )}
          <details className="chain-records">
            <summary>All loaded rewards &amp; delegations</summary>
            {[...rewardRows]
              .sort((a, b) => b.epoch - a.epoch)
              .map((r, i) => (
                <div key={`reward:${i}`} className="flow-record">
                  <Link to={`/explorer/epoch/${r.epoch}`}>
                    Earned in epoch {r.epoch}
                  </Link>
                  <span>
                    {r.type}
                    {r.pool_id && (
                      <>
                        {" "}
                        ·{" "}
                        <Link to={`/explorer/pool/${r.pool_id}`}>
                          {r.pool_id}
                        </Link>
                      </>
                    )}
                  </span>
                  <strong>{formatAda(BigInt(r.amount))}</strong>
                </div>
              ))}
            {delegationRows.map((d, i) => (
              <Link key={`delegation:${i}`} to={`/explorer/tx/${d.tx_hash}`}>
                <span>Delegation effective in epoch {d.active_epoch}</span>
                <code>{d.pool_id}</code>
              </Link>
            ))}
          </details>
          <div className="mint-heading">
            <div>
              <span className="eyebrow">On the ledger</span>
              <h3>Milestones, by transaction date.</h3>
            </div>
          </div>
          <ol className="stake-milestones">
            {dated.map((e) => (
              <li key={e.id} className={e.kind}>
                <i aria-hidden="true">{e.kind === "withdrawal" ? "↗" : "◎"}</i>
                <div>
                  <time dateTime={new Date(e.time * 1000).toISOString()}>
                    {new Date(e.time * 1000).toLocaleDateString(undefined, {
                      year: "numeric",
                      month: "short",
                      day: "numeric",
                    })}
                  </time>
                  <Link to={`/explorer/tx/${e.hash}`}>{e.label} ↗</Link>
                  <strong>{e.value}</strong>
                </div>
              </li>
            ))}
          </ol>
          {dated.length === 0 &&
            !registrations.isPending &&
            !withdrawals.isPending && (
              <p className="chain-empty">
                No registration or withdrawal records loaded.
              </p>
            )}
        </>
      )}
    </section>
  );
}
