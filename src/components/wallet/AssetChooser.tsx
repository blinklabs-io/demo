import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { blockfrostFetch } from "../../lib/dingo/blockfrost";
import { assetName } from "../../lib/tools/transactions";
import { ChainMark } from "../explorer/ChainMark";
import { CopyButton } from "../explorer/CopyButton";
export function AssetIcon({ assetId }: { assetId: string }) {
  const [failed, setFailed] = useState("");
  const query = useQuery({
    queryKey: ["dingo", "asset", assetId],
    queryFn: ({ signal }) =>
      blockfrostFetch<{ onchain_metadata?: { image?: unknown } }>(
        `/api/v0/assets/${assetId}`,
        { signal },
      ),
    staleTime: 3600000,
    retry: false,
    refetchOnWindowFocus: false,
  });
  const raw = query.data?.onchain_metadata?.image;
  const image =
    typeof raw === "string"
      ? raw
      : Array.isArray(raw) && raw.every((v) => typeof v === "string")
        ? raw.join("")
        : "";
  const supported = /^https?:\/\//.test(image) || /^data:image\//.test(image);
  return (
    <span className="asset-choice-icon">
      {supported && image !== failed ? (
        <img
          src={image}
          alt=""
          loading="lazy"
          decoding="async"
          referrerPolicy="no-referrer"
          onError={() => setFailed(image)}
        />
      ) : (
        <ChainMark value={assetId} />
      )}
    </span>
  );
}
export function AssetChooser({
  tokens,
  selected,
  onChange,
}: {
  tokens: { assetId: string; quantity: bigint }[];
  selected: Map<string, string>;
  onChange: (value: Map<string, string>) => void;
}) {
  const [search, setSearch] = useState(""),
    [page, setPage] = useState(1);
  const rows = tokens
    .filter(
      (t) =>
        t.quantity > 0n &&
        `${assetName(t.assetId)} ${t.assetId}`
          .toLowerCase()
          .includes(search.trim().toLowerCase()),
    )
    .sort(
      (a, b) =>
        assetName(a.assetId).localeCompare(assetName(b.assetId)) ||
        a.assetId.localeCompare(b.assetId),
    );
  const pages = Math.max(1, Math.ceil(rows.length / 12)),
    current = Math.min(page, pages),
    visible = rows.slice((current - 1) * 12, current * 12);
  const toggle = (id: string) => {
    const next = new Map(selected);
    if (next.has(id)) next.delete(id);
    else if (next.size < 24) next.set(id, "1");
    onChange(next);
  };
  return (
    <section className="additional-assets">
      <header>
        <div>
          <span className="eyebrow">Build your bundle</span>
          <h2>Additional assets</h2>
        </div>
        <span>{selected.size} / 24 selected</span>
      </header>
      <label className="asset-choice-search">
        Search wallet assets
        <input
          type="search"
          aria-label="Search wallet assets"
          value={search}
          onChange={(e) => {
            setSearch(e.target.value);
            setPage(1);
          }}
          placeholder="Asset name or policy / asset ID…"
        />
      </label>
      <div className="asset-choice-grid">
        {visible.map((t) => (
          <button
            type="button"
            className={
              selected.has(t.assetId) ? "asset-choice selected" : "asset-choice"
            }
            key={t.assetId}
            aria-pressed={selected.has(t.assetId)}
            aria-label={`${selected.has(t.assetId) ? "Remove" : "Add"} ${assetName(t.assetId)}, ${t.quantity} raw units available, ${t.assetId}`}
            disabled={!selected.has(t.assetId) && selected.size >= 24}
            onClick={() => toggle(t.assetId)}
          >
            <AssetIcon assetId={t.assetId} />
            <strong>{assetName(t.assetId)}</strong>
            <small>{t.quantity.toLocaleString()} raw units</small>
            <code>
              {t.assetId.slice(0, 8)}…{t.assetId.slice(-6)}
            </code>
            <span className="asset-choice-check" aria-hidden="true">
              {selected.has(t.assetId) ? "✓" : "+"}
            </span>
          </button>
        ))}
      </div>
      {!visible.length && (
        <p className="chain-empty">
          {tokens.some((token) => token.quantity > 0n)
            ? "No wallet assets match your search."
            : "This wallet has no additional assets."}
        </p>
      )}
      <nav className="asset-choice-pagination" aria-label="Wallet asset pages">
        <button
          type="button"
          disabled={current <= 1}
          onClick={() => setPage(current - 1)}
        >
          ← Previous
        </button>
        <span>
          {rows.length} assets · page {current} of {pages}
        </span>
        <button
          type="button"
          disabled={current >= pages}
          onClick={() => setPage(current + 1)}
        >
          Next →
        </button>
      </nav>
      {selected.size > 0 && (
        <div className="asset-bundle">
          <h3>Selected bundle</h3>
          {[...selected].map(([id, amount]) => (
            <div className="asset-bundle-row" key={id}>
              <AssetIcon assetId={id} />
              <div>
                <strong>{assetName(id)}</strong>
                <div className="tool-identifier">
                  <code>{id}</code>
                  <CopyButton value={id} label="asset ID" />
                </div>
                <small>
                  Available:{" "}
                  {tokens
                    .find((t) => t.assetId === id)
                    ?.quantity.toLocaleString() ?? "0"}{" "}
                  raw units
                </small>
              </div>
              <label>
                Raw units
                <input
                  aria-label={`Quantity of ${assetName(id)}`}
                  inputMode="numeric"
                  value={amount}
                  onChange={(e) => {
                    const next = new Map(selected);
                    next.set(id, e.target.value);
                    onChange(next);
                  }}
                />
              </label>
              <button
                type="button"
                aria-label={`Remove ${assetName(id)}`}
                onClick={() => toggle(id)}
              >
                ×
              </button>
            </div>
          ))}
        </div>
      )}
      <p className="metadata-hint">
        Amounts use raw units. ADA stays in the same recipient output with your
        chosen assets; the reviewed amount must meet its minimum ADA
        requirement.
      </p>
    </section>
  );
}
