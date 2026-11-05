import { EmptyState, PageIntro } from "../../components/explorer/Visuals";
import { Panel } from "../../components/explorer/Panel";
import { useEffect } from "react";
import { useParams, useNavigate } from "react-router";
import { useQuery } from "@tanstack/react-query";
import { resolveLookup } from "../../lib/resolveLookup";
import { useMempoolStore } from "../../stores/mempoolStore";

export default function LookupResolver() {
  const { hash: rawHash } = useParams();
  const hash = rawHash?.toLowerCase();
  const valid = Boolean(hash && /^[0-9a-f]{64}$/.test(hash));
  const navigate = useNavigate();
  // Pending hashes bypass classification; TxDetail still verifies inclusion.
  const isPendingTx = useMempoolStore((state) =>
    hash ? state.pendingTxs.has(hash) : false,
  );

  const { data, error } = useQuery({
    queryKey: ["dingo", "lookup", hash],
    queryFn: ({ signal }) => resolveLookup(hash!, signal),
    enabled: valid && !isPendingTx,
  });

  useEffect(() => {
    if (!hash || !valid) return;
    if (isPendingTx) {
      navigate(`/explorer/tx/${hash}`, { replace: true });
      return;
    }
    if (!data) return;
    if (data.kind === "tx") {
      navigate(`/explorer/tx/${hash}`, { replace: true });
    } else if (data.kind === "block") {
      navigate(`/explorer/block/${hash}`, { replace: true });
    } else if (data.kind === "asset") {
      navigate(`/explorer/asset/${hash}`, { replace: true });
    }
  }, [data, hash, valid, isPendingTx, navigate]);

  let title = "Searching the chain…";
  let detail = "Checking transactions, blocks, and assets through Dingo.";
  if (!valid) {
    title = "That hash does not look right.";
    detail = "Transaction and block hashes contain 64 hexadecimal characters.";
  } else if (error) {
    title = "Lookup unavailable";
    detail = error instanceof Error ? error.message : "Could not search Dingo.";
  } else if (data?.kind === "none") {
    title = "No matching record.";
    detail = `No transaction, block, or asset matches ${hash}.`;
  }
  return (
    <div className="detail-showcase flex flex-col gap-4">
      <PageIntro
        eyebrow="Search through Dingo"
        title="Chain lookup"
        symbol="⌕"
      />
      <Panel>
        <div role={error ? "alert" : valid && !data ? "status" : undefined}>
          <EmptyState icon="⌕" title={title} detail={detail} />
        </div>
      </Panel>
    </div>
  );
}
