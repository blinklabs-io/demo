import { RollingNumber } from "../../components/RollingNumber";
import { LeiosBlockPanel } from "../../components/explorer/LeiosPulse";
import { LeiosTransactions } from "../../components/explorer/LeiosTransactions";
import { DINGO_NETWORK } from "../../lib/dingo/config";
import { BlockCapacity } from "../../components/explorer/BlockCapacity";
import { LazyDisclosure } from "../../components/explorer/LazyDisclosure";
import { PaginatedList } from "../../components/explorer/PaginatedList";
import { BlockMosaic } from "../../components/chain/BlockMosaic";
import { BlockHeaderVersion } from "../../components/explorer/BlockHeaderVersion";
import { Metric } from "../../components/explorer/Visuals";
import { Link } from "../../components/NetworkLink";
import { useParams } from "react-router";
import { useQuery } from "@tanstack/react-query";
import { blockfrostFetch, BlockfrostError } from "../../lib/dingo/blockfrost";
import { Panel, Field } from "../../components/explorer/Panel";
import { HashLink } from "../../components/explorer/HashLink";
import { QueryState } from "../../components/explorer/QueryState";
import { formatNativeCoin } from "../../lib/format";
import { CopyButton } from "../../components/explorer/CopyButton";

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

  const block = blockQuery.error instanceof BlockfrostError && blockQuery.error.status === 404
    ? undefined
    : blockQuery.data;


  const mined = block ? new Date(block.time * 1000) : null;

  return (
    <div className="flex flex-col gap-4 detail-showcase">
      <header className="detail-header">
        <div>
          <h1>{block ? `Block #${block.height.toLocaleString()}` : "Block"}</h1>
          {block && (
            <p className="detail-id">
              <code>{block.hash}</code>
              <CopyButton value={block.hash} label="block hash" />
            </p>
          )}
        </div>
        {block && (
          <nav aria-label="Adjacent blocks">
            {block.previous_block ? (
              <Link to={`/explorer/block/${block.previous_block}`}>Previous</Link>
            ) : (
              <span>Genesis boundary</span>
            )}
            {block.next_block ? (
              <Link to={`/explorer/block/${block.next_block}`}>Next</Link>
            ) : (
              <span>Chain tip</span>
            )}
          </nav>
        )}
      </header>
      <QueryState
        hasData={block !== undefined}
        isLoading={blockQuery.isLoading}
        error={blockQuery.error}
        notFoundLabel="Block not found."
      >
        {block && mined && (
          <>
            <div className="metric-grid">
              <Metric
                label="Time"
                value={mined.toLocaleTimeString()}
                detail={mined.toLocaleDateString(undefined, {
                  dateStyle: "medium",
                })}
              />
              <Metric
                label="Epoch"
                value={block.epoch.toLocaleString()}
                detail={`Slot ${block.epoch_slot.toLocaleString()} of the epoch`}
              />
              <Metric
                label="Transactions"
                value={block.tx_count.toLocaleString()}
                detail={
                  block.fees !== null
                    ? `${formatNativeCoin(BigInt(block.fees))} in fees`
                    : undefined
                }
              />
              <Metric
                label="Size"
                value={`${(block.size / 1024).toFixed(1)} KB`}
                detail={`${block.size.toLocaleString()} bytes`}
              />
              <Metric
                label="Confirmations"
                value={
                  <RollingNumber value={block.confirmations.toLocaleString()} />
                }
              />
            </div>
            <Panel title="Production and capacity">
              <div className="block-cockpit">
                <figure className="block-stack">
                  <div aria-hidden="true">
                    {block.tx_count === 0 ? (
                      <i className="empty" />
                    ) : (
                      Array.from(
                        { length: Math.min(12, block.tx_count) },
                        (_, i) => (
                          <i key={i} style={{ animationDelay: `${i * 30}ms` }} />
                        ),
                      )
                    )}
                  </div>
                  <figcaption>
                    {block.tx_count === 0
                      ? "Empty block"
                      : `${block.tx_count.toLocaleString()} ${block.tx_count === 1 ? "transaction" : "transactions"}${block.tx_count > 12 ? ", 12 drawn" : ""}`}
                  </figcaption>
                </figure>
                <div className="block-producer">
                  <span className="field-label">Produced by</span>
                  <HashLink kind="pool" id={block.slot_leader} />
                  <span className="field-label">Node</span>
                  <BlockHeaderVersion hash={block.hash} slot={block.slot} />
                </div>
                <BlockCapacity
                  hash={block.hash}
                  slot={block.slot}
                  epoch={block.epoch}
                />
                <LeiosBlockPanel key={block.hash} block={block} />
              </div>
            </Panel>
            <Panel title="Details">
              <div className="field-grid">
                <Field label="Absolute slot" value={block.slot.toLocaleString()} />
                {block.output !== null && (
                  <Field
                    label="Total output"
                    value={formatNativeCoin(BigInt(block.output))}
                  />
                )}
                {block.fees !== null && (
                  <Field
                    label="Fees"
                    value={formatNativeCoin(BigInt(block.fees))}
                  />
                )}
                {block.previous_block && (
                  <Field
                    label="Previous block"
                    value={<HashLink kind="block" id={block.previous_block} />}
                  />
                )}
                {block.next_block && (
                  <Field
                    label="Next block"
                    value={<HashLink kind="block" id={block.next_block} />}
                  />
                )}
              </div>
              <details className="technical-details">
                <summary>VRF proof and operational certificate</summary>
                {block.block_vrf && (
                  <Field label="Block VRF" value={block.block_vrf} />
                )}
                {block.op_cert && (
                  <Field label="Operational certificate" value={block.op_cert} />
                )}
                {block.op_cert_counter && (
                  <Field
                    label="Operational certificate counter"
                    value={block.op_cert_counter}
                  />
                )}
              </details>
            </Panel>
          </>
        )}
      </QueryState>

      {block && DINGO_NETWORK.id === "musashi" && <LeiosTransactions block={block} />}
      {block && DINGO_NETWORK.id !== "musashi" && (
        <BlockMosaic hash={block.hash} total={block.tx_count} />
      )}
      {block && DINGO_NETWORK.id !== "musashi" && block.tx_count > 4 && (
        <LazyDisclosure key={block.hash} title="Transaction hash list">
          <Panel title="Transactions">
            <PaginatedList<string>
              totalItems={block.tx_count}
              queryKey={["dingo", "block", block.hash, "txs"]}
              buildUrl={(page, count) =>
                `/api/v0/blocks/${block!.hash}/txs?page=${page}&count=${count}&order=asc`
              }
              emptyLabel="No transactions in this block."
              keyFor={(hash) => hash}
              renderItem={(hash) => <HashLink kind="tx" id={hash} />}
            />
          </Panel>
        </LazyDisclosure>
      )}
    </div>
  );
}
