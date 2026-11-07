import { LeiosBlockPanel } from "../../components/explorer/LeiosPulse";
import { LeiosTransactions } from "../../components/explorer/LeiosTransactions";
import { DINGO_NETWORK } from "../../lib/dingo/config";
import { BlockCapacity } from "../../components/explorer/BlockCapacity";
import { LazyDisclosure } from "../../components/explorer/LazyDisclosure";
import { PaginatedList } from "../../components/explorer/PaginatedList";
import { BlockMosaic } from "../../components/chain/BlockMosaic";
import { PageIntro } from "../../components/explorer/Visuals";
import { BlockHeaderVersion } from "../../components/explorer/BlockHeaderVersion";
import { Metric, Timeline } from "../../components/explorer/Visuals";
import { useParams } from "react-router";
import { useQuery } from "@tanstack/react-query";
import { blockfrostFetch, BlockfrostError } from "../../lib/dingo/blockfrost";
import { Panel, Field } from "../../components/explorer/Panel";
import { HashLink } from "../../components/explorer/HashLink";
import { QueryState } from "../../components/explorer/QueryState";
import { formatNativeCoin } from "../../lib/format";

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


  return (
    <div className="flex flex-col gap-4 detail-showcase">
      <PageIntro
        eyebrow="Forged. Validated. On chain."
        title="Block explorer"
        symbol="⬡"
      />
      <Panel title="Block details">
        <QueryState hasData={block !== undefined}
          isLoading={blockQuery.isLoading}
          error={blockQuery.error}
          notFoundLabel="Block not found."
        >
          {block && (
            <div>
              <div className="metric-grid">
                <Metric
                  label="Block height"
                  value={`#${block.height.toLocaleString()}`}
                />
                <Metric label="Transactions" value={block.tx_count} />
                <Metric
                  label="Block size"
                  value={`${(block.size / 1024).toFixed(1)} KB`}
                />
              </div>
              <div className="block-cockpit">
                <div className="block-producer">
                  <span className="block-monument" aria-hidden="true">
                    ⬡
                  </span>
                  <span className="eyebrow">Forged by</span>
                  <HashLink kind="pool" id={block.slot_leader} />
                  <BlockHeaderVersion
                    hash={block.hash}
                    slot={block.slot}
                  />
                </div>
                <BlockCapacity hash={block.hash} slot={block.slot} epoch={block.epoch} />
                <LeiosBlockPanel key={block.hash} block={block} />
              </div>
              <div className="block-chain-timeline my-6">
                <Timeline
                  items={[
                    {
                      label: "Previous block",
                      complete: Boolean(block.previous_block),
                      detail: block.previous_block ? (
                        <HashLink
                          kind="block"
                          id={block.previous_block}
                        />
                      ) : (
                        "Genesis boundary"
                      ),
                    },
                    {
                      label: `Block #${block.height.toLocaleString()}`,
                      complete: true,
                      detail: new Date(
                        block.time * 1000,
                      ).toLocaleString(),
                    },
                    {
                      label: "Next block",
                      complete: Boolean(block.next_block),
                      detail: block.next_block ? (
                        <HashLink
                          kind="block"
                          id={block.next_block}
                        />
                      ) : (
                        "At the chain tip"
                      ),
                    },
                  ]}
                />
              </div>
              <Field label="Hash" value={block.hash} />

              <Field label="Slot" value={block.slot} />
              <Field
                label="Epoch"
                value={`${block.epoch} (slot ${block.epoch_slot})`}
              />
              <Field
                label="Time"
                value={new Date(block.time * 1000).toLocaleString()}
              />
              {block.output !== null && (
                <Field
                  label="Output"
                  value={`${formatNativeCoin(BigInt(block.output))}`}
                />
              )}
              {block.fees !== null && (
                <Field
                  label="Fees"
                  value={`${formatNativeCoin(BigInt(block.fees))}`}
                />
              )}
              <details className="technical-details">
                <summary>
                  Cryptographic proofs & operational certificate
                </summary>{" "}
                {block.block_vrf && (
                  <Field label="Block VRF" value={block.block_vrf} />
                )}
                {block.op_cert && (
                  <Field
                    label="Operational certificate"
                    value={block.op_cert}
                  />
                )}
                {block.op_cert_counter && (
                  <Field
                    label="Operational certificate counter"
                    value={block.op_cert_counter}
                  />
                )}
              </details>
              <Field
                label="Confirmations"
                value={block.confirmations}
              />
            </div>
          )}
        </QueryState>
      </Panel>

      {block && DINGO_NETWORK.id === "musashi" && <LeiosTransactions block={block} />}
      {block && DINGO_NETWORK.id !== "musashi" && (
        <BlockMosaic
          hash={block.hash}
          total={block.tx_count}
        />
      )}
      {block && DINGO_NETWORK.id !== "musashi" && (
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
              renderItem={(hash) => (
                <>
                  <span className="status-badge positive">TX</span>
                  <HashLink kind="tx" id={hash} />
                </>
              )}
            />
          </Panel>
        </LazyDisclosure>
      )}
    </div>
  );
}
