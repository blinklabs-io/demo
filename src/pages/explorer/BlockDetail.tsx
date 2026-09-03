import { useParams } from "react-router";
import { useQuery } from "@tanstack/react-query";
import { blockfrostFetch } from "../../lib/dingo/blockfrost";
import { Panel, Field } from "../../components/explorer/Panel";
import { HashLink } from "../../components/explorer/HashLink";
import { QueryState } from "../../components/explorer/QueryState";

interface BlockDetailResponse {
  time: number;
  height: number;
  hash: string;
  slot: number;
  epoch: number;
  epoch_slot: number;
  slot_leader: string;
  size: number;
  tx_count: number;
  output: string | null;
  fees: string | null;
  previous_block: string;
  next_block: string | null;
  confirmations: number;
}

export default function BlockDetail() {
  const { id } = useParams();

  const blockQuery = useQuery({
    queryKey: ["dingo", "block", id],
    queryFn: () => blockfrostFetch<BlockDetailResponse>(`/api/v0/blocks/${id}`),
    enabled: Boolean(id),
  });

  // Dingo only exposes a transaction list for the current tip
  // (GET /api/v0/blocks/latest/txs) - there is no per-block equivalent. Only
  // fetch it when this block turns out to be the current tip - and check
  // that live, not from blockQuery's (possibly stale) cached confirmations:
  // otherwise, if a new block lands after this page loaded, a refetch of
  // /blocks/latest/txs would attribute the *new* tip's transactions to this
  // (no longer current) block.
  const latestBlockQuery = useQuery({
    queryKey: ["dingo", "block", "latest-hash"],
    queryFn: () => blockfrostFetch<{ hash: string }>("/api/v0/blocks/latest"),
    refetchInterval: 15_000,
  });
  const isTip = Boolean(
    blockQuery.data &&
      latestBlockQuery.data &&
      blockQuery.data.hash === latestBlockQuery.data.hash,
  );
  const latestTxsQuery = useQuery({
    queryKey: ["dingo", "block", blockQuery.data?.hash, "latest-txs"],
    queryFn: () => blockfrostFetch<string[]>("/api/v0/blocks/latest/txs"),
    enabled: isTip,
  });

  return (
    <div className="flex flex-col gap-4">
      <Panel title={`Block ${id}`}>
        <QueryState
          isLoading={blockQuery.isLoading}
          error={blockQuery.error}
          notFoundLabel="Block not found."
        >
          {blockQuery.data && (
            <div>
              <Field label="Hash" value={blockQuery.data.hash} />
              <Field label="Height" value={blockQuery.data.height} />
              <Field label="Slot" value={blockQuery.data.slot} />
              <Field
                label="Epoch"
                value={`${blockQuery.data.epoch} (slot ${blockQuery.data.epoch_slot})`}
              />
              <Field
                label="Time"
                value={new Date(blockQuery.data.time * 1000).toLocaleString()}
              />
              <Field label="Slot leader" value={blockQuery.data.slot_leader} />
              <Field label="Size" value={`${blockQuery.data.size} bytes`} />
              <Field label="Tx count" value={blockQuery.data.tx_count} />
              <Field
                label="Confirmations"
                value={blockQuery.data.confirmations}
              />
              <Field
                label="Previous block"
                value={
                  blockQuery.data.previous_block ? (
                    <HashLink kind="block" id={blockQuery.data.previous_block} full />
                  ) : (
                    "—"
                  )
                }
              />
              <Field
                label="Next block"
                value={
                  blockQuery.data.next_block ? (
                    <HashLink kind="block" id={blockQuery.data.next_block} full />
                  ) : (
                    "—"
                  )
                }
              />
            </div>
          )}
        </QueryState>
      </Panel>

      {isTip && (
        <Panel title="Transactions">
          <QueryState
            isLoading={latestTxsQuery.isLoading}
            error={latestTxsQuery.error}
          >
            {latestTxsQuery.data && latestTxsQuery.data.length === 0 && (
              <p className="text-sm text-slate-500">
                No transactions in this block.
              </p>
            )}
            <ul className="flex flex-col gap-1">
              {latestTxsQuery.data?.map((hash) => (
                <li key={hash}>
                  <HashLink kind="tx" id={hash} visible={16} />
                </li>
              ))}
            </ul>
          </QueryState>
        </Panel>
      )}
      {!isTip && blockQuery.data && (
        <p className="text-xs text-slate-500">
          Dingo only lists transactions for the current chain tip; this block
          has since been superseded, so its transaction list isn't available
          here. Look up individual transactions by hash instead.
        </p>
      )}
    </div>
  );
}
