import { BuildThis } from "../developer/BuildThis";
import { useCallback, useMemo, useState } from "react";
import { queryOptions, useQueries, useQuery } from "@tanstack/react-query";
import { DINGO_NETWORK } from "../../lib/dingo/config";
import { blockfrostFetch } from "../../lib/dingo/blockfrost";
import { blockBytesQuery } from "../../lib/dingo/blockHeader";
import {
  decodeLeiosBlock,
  leiosTotals,
  type LeiosObservation,
} from "../../lib/dingo/leios";
import {
  recentBlocksQuery,
  type BlockSummary,
} from "../../lib/explorer/recentBlocks";
import { Link } from "../NetworkLink";
import { CopyButton } from "./CopyButton";
import "./leios.css";

function Observation({ row }: { row: LeiosObservation }) {
  return (
    <div className="leios-inspection">
      <header>
        <div>
          <span className="eyebrow">
            Ranking block #{row.height.toLocaleString()}
          </span>
          <h3>
            {row.certified
              ? "A certificate joins the chain."
              : row.announcement
                ? "An endorser block is announced."
                : "The ranking chain moves forward."}
          </h3>
        </div>
        <Link to={`/explorer/block/${row.hash}`}>Open block →</Link>
      </header>
      <dl className="leios-facts">
        <div>
          <dt>Ranking-block bytes</dt>
          <dd>{row.nativeBytes.toLocaleString()}</dd>
        </div>
        <div>
          <dt>Transactions in this ranking body</dt>
          <dd>{row.rankingTransactions.toLocaleString()}</dd>
        </div>
        <div>
          <dt>Certificate signer positions</dt>
          <dd>
            {row.certificate
              ? row.certificate.signerCount.toLocaleString()
              : "No certificate"}
          </dd>
        </div>
      </dl>
      {row.announcement && (
        <div className="leios-announcement">
          <span>
            Announced endorser block · {row.announcement.bytes.toLocaleString()}{" "}
            bytes
          </span>
          <code>{row.announcement.hash}</code>
          <CopyButton
            value={row.announcement.hash}
            label="announced endorser block hash"
          />
        </div>
      )}
      {row.certificate && (
        <p className="leios-note">
          {row.certificate.bitfieldBytes.toLocaleString()}{" "}
          {row.certificate.bitfieldBytes === 1 ? "byte" : "bytes"} of signer
          bitfield · {row.certificate.signatureBytes} bytes of aggregate
          signature. Set bits count signer positions; committee size, voting
          weight, and quorum are not inferred.
        </p>
      )}
    </div>
  );
}

export function LeiosPulse() {
  if (DINGO_NETWORK.id !== "musashi")
    return (
      <section className="leios-panel">
        <h2>Explore Leios on Musashi.</h2>
        <p>
          Follow endorser-block announcements and certificates on the
          Leios-enabled network.
        </p>
        <Link to="/explorer/leios?network=musashi">Switch to Musashi →</Link>
      </section>
    );
  return <MusashiPulse />;
}

function MusashiPulse() {
  const [active, setActive] = useState("");
  const genesis = useQuery({
    queryKey: ["dingo", "genesis"],
    queryFn: ({ signal }) =>
      blockfrostFetch<{ network_magic: number }>("/api/v0/genesis", { signal }),
    staleTime: Infinity,
  });
  const verified =
    genesis.data?.network_magic === DINGO_NETWORK.networkMagic &&
    !genesis.isError;
  const recent = useQuery({
    ...recentBlocksQuery,
    enabled: verified,
    refetchInterval: 15000,
  });
  const blocks = useMemo(
    () => (!verified ? [] : (recent.data?.blocks ?? [])),
    [verified, recent.data],
  );
  if (active && !blocks.some((block) => block.hash === active)) setActive("");
  const queries = useMemo(
    () =>
      blocks.map((block) => queryOptions({
        ...blockBytesQuery(block.hash, block.slot),
        select: (bytes: Uint8Array) => decodeLeiosBlock(bytes, block),
        enabled: verified,
        refetchInterval: (query) => query.state.status === "error" ? 15000 : false,
      })),
    [blocks, verified],
  );
  const observations = useQueries({ queries });
  const rows = observations.flatMap((query) =>
    !query.isError && query.data ? [query.data] : [],
  );
  const selected = rows.find((row) => row.hash === active) ?? rows[0];
  const totals = leiosTotals(rows);
  const maxBytes = Math.max(
    1,
    ...rows.map((row) => row.announcement?.bytes ?? 0),
  );
  const unavailable = observations.filter((query) => query.isError).length;
  return (
    <section className="leios-panel" aria-label="Leios activity">
      <header className="leios-heading">
        <div>
          <span className="eyebrow">Musashi · {recent.isError ? "saved Leios sample" : "live Leios observations"}</span>
          <h1>
            Small ranking blocks.
            <br />
            <em>A bigger story.</em>
          </h1>
          <p>
            Follow the ranking chain as it announces endorser blocks and carries
            certificates.
          </p>
        </div>
        <span className="leios-orbit" aria-hidden="true">
          ◉<i>EB</i>
          <b>RB</b>
        </span>
      </header>
      {!verified && (
        <p role="status">
          {genesis.isError
            ? "Network verification unavailable."
            : genesis.data
              ? "The API is serving a different network."
              : "Verifying Musashi…"}
        </p>
      )}
      {!verified && !genesis.isFetching && <button type="button" onClick={() => void genesis.refetch()}>Retry network verification</button>}
      {recent.error && <p role="alert">{recent.error.message}</p>}
      {verified && recent.data?.incomplete && <p role="status">The recent block sample is incomplete. Announcements and certificates may be missing.</p>}
      {recent.isError && recent.data && <p role="status">Showing the last successful sample, read {new Date(recent.dataUpdatedAt).toLocaleString()}. Refresh is unavailable.</p>}
      <div className="leios-metrics">
        <div>
          <strong>{rows.length}</strong>
          <span>Decoded ranking blocks</span>
        </div>
        <div>
          <strong>{totals.announcements}</strong>
          <span>Announcements</span>
        </div>
        <div>
          <strong>{totals.certificates}</strong>
          <span>Certificates carried</span>
        </div>
        <div>
          <strong>{totals.announcedBytes.toLocaleString()}</strong>
          <span>Announced bytes · includes repeats</span>
        </div>
      </div>
      {rows.length > 0 && (
        <>
          <div className="leios-key">
            <span className="leios-purple">● Announced payload size</span>
            <span className="leios-teal">◆ Certificate present</span>
            <span>Oldest → newest · select a block</span>
          </div>
          <div
            className="leios-timeline"
            role="group"
            aria-label="Ranking-block timeline"
          >
            {[...rows].reverse().map((row) => (
              <button
                type="button"
                key={row.hash}
                aria-pressed={selected?.hash === row.hash}
                aria-label={`Inspect ranking block ${row.height}`}
                onClick={() => setActive(row.hash)}
              >
                <div className="leios-payload">
                  <i
                    style={{
                      height: `${row.announcement ? (row.announcement.bytes / maxBytes) * 100 : 0}%`,
                    }}
                  />
                </div>
                <div
                  className={`leios-certificate ${row.certified ? "present" : ""}`}
                  aria-hidden="true"
                >
                  {row.certified ? "◆" : "·"}
                </div>
                <span>#{row.height.toLocaleString()}</span>
              </button>
            ))}
          </div>
          {selected && <Observation row={selected} />}
        </>
      )}
      {verified && !recent.isLoading && !recent.isError && !rows.length && (
        <p role="status">
          {observations.some((query) => query.isLoading)
            ? "Reading native ranking blocks…"
            : "No decoded Leios extensions in this sample."}
        </p>
      )}
      {unavailable > 0 && (
        <p role="status">
          Native Leios data unavailable for {unavailable} sampled blocks. Other
          decoded blocks remain available.
        </p>
      )}
      <p className="leios-note">
        {recent.isError ? "Last successful sample of" : "Latest"} {blocks.length} indexed blocks · refreshes every 15 seconds.
        Announcements describe proposed payloads, not executed bytes. A
        certificate refers to an earlier announcement; it is not linked to the
        announcement on the same card. Signatures are displayed as node-supplied
        chain data.
      </p>
      <BuildThis recipe="leios" />
      <div className="leios-links">
        <Link to="/explorer">Explore the ranking chain →</Link>
        <Link to="/api">Inspect the APIs →</Link>
      </div>
    </section>
  );
}

export function LeiosBlockPanel({
  block,
}: {
  block: Pick<BlockSummary, "hash" | "slot" | "height">;
}) {
  if (DINGO_NETWORK.id !== "musashi") return null;
  return <BlockObservation block={block} />;
}
function BlockObservation({
  block,
}: {
  block: Pick<BlockSummary, "hash" | "slot" | "height">;
}) {
  const [open, setOpen] = useState(false);
  const select = useCallback(
    (bytes: Uint8Array) => decodeLeiosBlock(bytes, block),
    [block],
  );
  const query = useQuery({
    ...blockBytesQuery(block.hash, block.slot),
    enabled: open,
    select,
  });
  return (
    <details
      className="leios-panel"
      onToggle={(event) => setOpen(event.currentTarget.open)}
    >
      <summary>Leios data · announcements & certificates</summary>
      {open && (
        <>
          {query.isLoading && <p>Reading native block…</p>}
          {query.error && <p role="alert">{query.error.message}</p>}
          {!query.isError && query.data && <Observation row={query.data} />}
          {query.isSuccess && !query.data && (
            <p>This header has no Leios extension.</p>
          )}
          <Link to="/explorer/leios">Open the Leios activity view →</Link>
        </>
      )}
    </details>
  );
}
