import { useNodeHealth } from "../../lib/dingo/nodeHealth";
import { useQuery } from "@tanstack/react-query";
import { blockfrostFetch } from "../../lib/dingo/blockfrost";
import {
  blockBytesQuery,
  decodeHeaderVersion,
} from "../../lib/dingo/blockHeader";
import { nodeImplementation } from "../../lib/dingo/nodeImplementation";
import { Link } from "../NetworkLink";
import { QueryState } from "./QueryState";

interface ProducerBlock {
  hash: string;
  height: number;
  slot: number;
  slot_leader: string;
  time: number;
}
export function PoolProducer({ poolId }: { poolId: string }) {
  const health = useNodeHealth();
  const epoch = health.data?.tipEpoch;
  const block = useQuery({
    queryKey: ["dingo", "pool", poolId, "producer-block", epoch],
    queryFn: async ({ signal }) => {
      const hashes = await blockfrostFetch<string[]>(
        `/api/v0/epochs/${epoch}/blocks/${poolId}?count=1&page=1&order=desc`,
        { signal },
      );
      if (!hashes.length) return null;
      const latest = await blockfrostFetch<ProducerBlock>(
        `/api/v0/blocks/${hashes[0]}`,
        { signal },
      );
      if (latest.hash !== hashes[0] || latest.slot_leader !== poolId)
        throw new Error("Latest block does not match this pool.");
      return latest;
    },
    staleTime: 60000,
    refetchInterval: 60000,
    enabled: epoch !== undefined,
  });
  const header = useQuery({
    ...blockBytesQuery(block.data?.hash ?? "", block.data?.slot ?? 0),
    enabled: Boolean(block.data),
    select: decodeHeaderVersion,
  });
  const node = header.data ? nodeImplementation(header.data.minor) : null;
  return (
    <section
      className="pool-producer"
      data-node={node?.id}
      aria-label="Recent block producer"
    >
      <span className="eyebrow">Recent block producer</span>
      <QueryState
        hasData={Boolean(node) || block.data === null}
        isLoading={health.isLoading || block.isLoading || (Boolean(block.data) && header.isLoading)}
        error={health.error || block.error || header.error}
        notFoundLabel="Dingo has no retained blocks for this pool in the current epoch."
      >
        {node && block.data && header.data && (
          <>
            <div className="pool-producer-identity">
              <img src={node.icon} alt="" width="48" height="48" />
              <div>
                <strong>{node.name}</strong>
                <span>
                  Header {header.data.major}.{header.data.minor}
                </span>
                {node.release && <span>{node.release}</span>}
              </div>
              <Link to={`/explorer/block/${block.data.hash}`}>
                Block #{block.data.height.toLocaleString()} ↗
              </Link>
            </div>
            <p>{node.detail}</p>
            <small>
              Self-reported by this pool’s block on{" "}
              {new Date(block.data.time * 1000).toLocaleString()}; not a claim
              about every node currently operated by the pool.
            </small>
          </>
        )}
        {block.data === null && (
          <p>
            No block in the current epoch is available to identify this pool’s
            software.
          </p>
        )}
      </QueryState>
    </section>
  );
}
