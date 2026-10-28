import { PageIntro } from "../../components/explorer/Visuals";
import { BlockHeaderVersion } from "../../components/explorer/BlockHeaderVersion";
import { Metric, Timeline, Gauge } from "../../components/explorer/Visuals";
import { useParams } from "react-router";
import { useQuery } from "@tanstack/react-query";
import { blockfrostFetch } from "../../lib/dingo/blockfrost";
import { Panel, Field } from "../../components/explorer/Panel";
import { HashLink } from "../../components/explorer/HashLink";
import { QueryState } from "../../components/explorer/QueryState";
import { formatAda } from "../../lib/format";

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
  block_vrf: string | null;
  op_cert: string | null;
  op_cert_counter: string | null;
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

  const txsQuery = useQuery({
    queryKey: ["dingo", "block", blockQuery.data?.hash, "txs"],
    queryFn: () =>
      blockfrostFetch<string[]>(`/api/v0/blocks/${blockQuery.data!.hash}/txs`),
    enabled: Boolean(blockQuery.data),
  });

  const limitsQuery = useQuery({
    queryKey: ["dingo", "epoch", blockQuery.data?.epoch, "block-limits"],
    queryFn: () =>
      blockfrostFetch<{ max_block_size: number }>(
        `/api/v0/epochs/${blockQuery.data!.epoch}/parameters`,
      ),
    enabled: Boolean(blockQuery.data),
    staleTime: Infinity,
  });

  return (
    <div className="flex flex-col gap-4 detail-showcase">
      <PageIntro
        eyebrow="Forged. Validated. On chain."
        title="Block explorer"
        symbol="⬡"
      />
      <Panel title="Block details">
        <QueryState
          isLoading={blockQuery.isLoading}
          error={blockQuery.error}
          notFoundLabel="Block not found."
        >
          {blockQuery.data && (
            <div>
              <div className="metric-grid">
                <Metric
                  label="Block height"
                  value={`#${blockQuery.data.height.toLocaleString()}`}
                />
                <Metric label="Transactions" value={blockQuery.data.tx_count} />
                <Metric
                  label="Block size"
                  value={`${(blockQuery.data.size / 1024).toFixed(1)} KB`}
                />
              </div>
              <div className="block-cockpit">
                <div className="block-producer">
                  <span className="block-monument" aria-hidden="true">
                    ⬡
                  </span>
                  <span className="eyebrow">Forged by</span>
                  <HashLink kind="pool" id={blockQuery.data.slot_leader} />
                  <BlockHeaderVersion
                    hash={blockQuery.data.hash}
                    slot={blockQuery.data.slot}
                  />
                </div>
                <QueryState
                  isLoading={limitsQuery.isLoading}
                  error={limitsQuery.error}
                >
                  {limitsQuery.data && (
                    <Gauge
                      label="Block capacity used"
                      value={
                        limitsQuery.data.max_block_size > 0
                          ? (blockQuery.data.size /
                              limitsQuery.data.max_block_size) *
                            100
                          : 0
                      }
                      detail={`${blockQuery.data.size.toLocaleString()} / ${limitsQuery.data.max_block_size.toLocaleString()} bytes · epoch ${blockQuery.data.epoch}`}
                      tone="violet"
                    />
                  )}
                </QueryState>
              </div>
              <div className="block-chain-timeline my-6">
                <Timeline
                  items={[
                    {
                      label: "Previous block",
                      complete: Boolean(blockQuery.data.previous_block),
                      detail: blockQuery.data.previous_block ? (
                        <HashLink
                          kind="block"
                          id={blockQuery.data.previous_block}
                        />
                      ) : (
                        "Genesis boundary"
                      ),
                    },
                    {
                      label: `Block #${blockQuery.data.height.toLocaleString()}`,
                      complete: true,
                      detail: new Date(
                        blockQuery.data.time * 1000,
                      ).toLocaleString(),
                    },
                    {
                      label: "Next block",
                      complete: Boolean(blockQuery.data.next_block),
                      detail: blockQuery.data.next_block ? (
                        <HashLink
                          kind="block"
                          id={blockQuery.data.next_block}
                        />
                      ) : (
                        "At the chain tip"
                      ),
                    },
                  ]}
                />
              </div>
              <Field label="Hash" value={blockQuery.data.hash} />

              <Field label="Slot" value={blockQuery.data.slot} />
              <Field
                label="Epoch"
                value={`${blockQuery.data.epoch} (slot ${blockQuery.data.epoch_slot})`}
              />
              <Field
                label="Time"
                value={new Date(blockQuery.data.time * 1000).toLocaleString()}
              />
              {blockQuery.data.output !== null && (
                <Field
                  label="Output"
                  value={`${formatAda(BigInt(blockQuery.data.output))}`}
                />
              )}
              {blockQuery.data.fees !== null && (
                <Field
                  label="Fees"
                  value={`${formatAda(BigInt(blockQuery.data.fees))}`}
                />
              )}
              <details className="technical-details">
                <summary>
                  Cryptographic proofs & operational certificate
                </summary>{" "}
                {blockQuery.data.block_vrf && (
                  <Field label="Block VRF" value={blockQuery.data.block_vrf} />
                )}
                {blockQuery.data.op_cert && (
                  <Field
                    label="Operational certificate"
                    value={blockQuery.data.op_cert}
                  />
                )}
                {blockQuery.data.op_cert_counter && (
                  <Field
                    label="Operational certificate counter"
                    value={blockQuery.data.op_cert_counter}
                  />
                )}
              </details>
              <Field
                label="Confirmations"
                value={blockQuery.data.confirmations}
              />
            </div>
          )}
        </QueryState>
      </Panel>

      <Panel title="Transactions">
        <QueryState isLoading={txsQuery.isLoading} error={txsQuery.error}>
          {txsQuery.data?.length === 0 && (
            <p className="text-sm text-slate-400">
              No transactions in this block.
            </p>
          )}
          <ul className="activity-list">
            {txsQuery.data?.map((hash) => (
              <li key={hash}>
                <span className="status-badge positive">TX</span>
                <HashLink kind="tx" id={hash} visible={16} />
              </li>
            ))}
          </ul>
        </QueryState>
      </Panel>
    </div>
  );
}
