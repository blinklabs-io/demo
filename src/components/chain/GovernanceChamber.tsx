import { useId, useState } from "react";
import { useInfiniteQuery } from "@tanstack/react-query";
import { Link } from "react-router";
import { blockfrostFetch } from "../../lib/dingo/blockfrost";
import { shortenHash } from "../../lib/format";
interface Ballot {
  tx_hash: string;
  cert_index: number;
  voter_role: string;
  voter: string;
  vote: string;
  counted: boolean;
}
const choices = [
  { id: "yes", name: "Yes", color: "#47dfb9" },
  { id: "no", name: "No", color: "#fb948d" },
  { id: "abstain", name: "Abstain", color: "#b5a5f8" },
];
function roleName(role: string) {
  return role === "drep"
    ? "DReps"
    : role === "spo"
      ? "Stake pools"
      : role === "constitutional_committee"
        ? "Committee"
        : role.replaceAll("_", " ");
}
function seatPositions(n: number) {
  const points: { x: number; y: number }[] = [];
  for (let r = 0; points.length < n; r++) {
    const radius = 95 + r * 34;
    const count = Math.max(1, Math.round((Math.PI * radius) / 27));
    for (let i = 0; i < count; i++) {
      const a = Math.PI + ((i + 0.5) / count) * Math.PI;
      points.push({
        x: 300 + Math.cos(a) * radius,
        y: 285 + Math.sin(a) * radius,
      });
    }
  }
  return points.slice(0, n);
}
export function GovernanceChamber({ proposalId }: { proposalId: string }) {
  return <Chamber key={proposalId} proposalId={proposalId} />;
}
function Chamber({ proposalId }: { proposalId: string }) {
  const [role, setRole] = useState("drep"),
    [vote, setVote] = useState("all");
  const uid = useId();
  const query = useInfiniteQuery({
    queryKey: ["dingo", "proposal", proposalId, "chamber-votes"],
    initialPageParam: 1,
    retry: false,
    queryFn: ({ pageParam, signal }) =>
      blockfrostFetch<Ballot[]>(
        `/api/v0/governance/proposals/${encodeURIComponent(proposalId)}/votes?page=${pageParam}&count=100&order=desc`,
        { signal },
      ),
    getNextPageParam: (last, pages) =>
      last.length === 100 ? pages.length + 1 : undefined,
  });
  const rows = query.data?.pages.flat() ?? [];
  const counted = [
    ...new Map(
      rows
        .filter((v) => v.counted)
        .reverse()
        .map((v) => [`${v.voter_role}:${v.voter}`, v]),
    ).values(),
  ];
  const roles = [
    ...new Set([
      "drep",
      "spo",
      "constitutional_committee",
      ...rows.map((v) => v.voter_role),
    ]),
  ];
  const active = counted.filter((v) => v.voter_role === role);
  const shown = active.filter((v) => vote === "all" || v.vote === vote);
  const dots = choices.flatMap((c) => {
    const values = active.filter((v) => v.vote === c.id);
    const chunk = Math.max(1, Math.ceil(active.length / 120));
    const result: { choice: typeof c; ballots: Ballot[] }[] = [];
    for (let i = 0; i < values.length; i += chunk)
      result.push({ choice: c, ballots: values.slice(i, i + chunk) });
    return result;
  });
  const positions = seatPositions(dots.length);
  return (
    <section className="chain-visual governance-chamber">
      <header className="chain-heading">
        <div>
          <span className="eyebrow">The voices behind the decision</span>
          <h2>Inside the voting chamber.</h2>
        </div>
        <span className="chain-scope">
          {rows.length} ballot records loaded
          {query.hasNextPage ? " · partial" : ""}
        </span>
      </header>
      <nav className="chamber-roles" aria-label="Voter role">
        {roles.map((r) => (
          <button
            key={r}
            aria-pressed={role === r}
            onClick={() => {
              setRole(r);
              setVote("all");
            }}
          >
            {roleName(r)}
            <strong>{counted.filter((v) => v.voter_role === r).length}</strong>
          </button>
        ))}
      </nav>
      {query.isPending && <p role="status">Reading recorded votes…</p>}
      {query.error && (
        <div role="alert" className="chain-error">
          {query.error.message}
          <button
            onClick={() =>
              void (query.hasNextPage ? query.fetchNextPage() : query.refetch())
            }
          >
            Retry votes
          </button>
        </div>
      )}
      <div className="chamber-layout">
        <svg viewBox="0 0 600 340" role="img" aria-labelledby={`${uid}-title`}>
          <title id={`${uid}-title`}>
            {roleName(role)} counted ballots loaded: {active.length}. Dots
            represent recorded ballots, not voting power.
          </title>
          <path
            d="M55 285 A245 245 0 0 1 545 285"
            fill="none"
            stroke="#273b4b"
            strokeDasharray="3 8"
          />
          {dots.map((d, i) => (
            <g key={`${d.choice.id}:${i}`}>
              <circle
                cx={positions[i]?.x}
                cy={positions[i]?.y}
                r="9"
                fill={d.choice.color}
                opacity={vote === "all" || vote === d.choice.id ? 1 : 0.12}
              />
              <title>
                {d.ballots.length} {d.choice.name} ballot
                {d.ballots.length === 1 ? "" : "s"}
              </title>
            </g>
          ))}
          <text x="300" y="265" textAnchor="middle" className="chamber-total">
            {active.length}
          </text>
          <text
            x="300"
            y="292"
            textAnchor="middle"
            fill="#8ea9b9"
            fontSize="13"
          >
            COUNTED BALLOTS LOADED
          </text>
        </svg>
        <div className="chamber-counts">
          <button
            className="chamber-reset"
            aria-pressed={vote === "all"}
            onClick={() => setVote("all")}
          >
            All choices
          </button>
          {choices.map((c) => (
            <button
              key={c.id}
              aria-pressed={vote === c.id}
              onClick={() => setVote(vote === c.id ? "all" : c.id)}
            >
              <i style={{ background: c.color }} />
              <span>{c.name}</span>
              <strong>{active.filter((v) => v.vote === c.id).length}</strong>
            </button>
          ))}
        </div>
      </div>
      {!active.length && !query.isPending && (
        <p className="chain-empty">
          No counted {roleName(role).toLowerCase()} ballots in the loaded
          records.
        </p>
      )}
      {query.hasNextPage && (
        <button
          disabled={query.isFetching}
          onClick={() => void query.fetchNextPage()}
        >
          {query.isFetching ? "Loading…" : "Load next 100 ballot records"}
        </button>
      )}
      <details className="chain-records">
        <summary>
          {shown.length} counted ballot records ·{" "}
          {
            rows.filter(
              (v) =>
                !v.counted &&
                v.voter_role === role &&
                (vote === "all" || v.vote === vote),
            ).length
          }{" "}
          uncounted records
        </summary>
        {shown.map((v) => (
          <Link
            key={`${v.voter_role}:${v.voter}`}
            to={`/explorer/tx/${v.tx_hash}`}
          >
            <code>{v.voter}</code>
            <span>
              {v.vote} · {shortenHash(v.tx_hash)} ↗
            </span>
          </Link>
        ))}
        {rows
          .filter(
            (v) =>
              !v.counted &&
              v.voter_role === role &&
              (vote === "all" || v.vote === vote),
          )
          .map((v, i) => (
            <Link
              key={`${v.tx_hash}:${v.cert_index}:${i}`}
              to={`/explorer/tx/${v.tx_hash}`}
            >
              <code>{v.voter}</code>
              <span>{v.vote} · not counted</span>
            </Link>
          ))}
      </details>
      <p className="chain-footnote">
        {active.length > 120
          ? `Each dot groups up to ${Math.ceil(active.length / 120)} ballots. `
          : "Each dot represents one counted ballot. "}
        These are {query.hasNextPage ? "partial loaded" : "returned"} ballot
        counts, not weighted voting power, eligible-voter participation, or a
        ratification threshold. The roles have separate electorates.
      </p>
    </section>
  );
}
