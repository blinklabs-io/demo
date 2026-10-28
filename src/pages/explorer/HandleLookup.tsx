import { useParams } from "react-router";
import { useQuery } from "@tanstack/react-query";
import { resolveHandle } from "../../lib/dingo/handles";
import { Panel } from "../../components/explorer/Panel";
import { HashLink } from "../../components/explorer/HashLink";
import { EmptyState } from "../../components/explorer/Visuals";

export default function HandleLookup() {
  const { handle } = useParams();
  const query = useQuery({
    queryKey: ["dingo", "handle", handle],
    queryFn: ({ signal }) => resolveHandle(handle!, signal),
    enabled: Boolean(handle),
    staleTime: 30_000,
    retry: false,
  });
  return (
    <Panel title={`$${handle}`}>
      {query.isPending && (
        <div role="status" className="visual-empty">
          <span className="empty-orbit" aria-hidden="true">
            $
          </span>
          <h2>Resolving ${handle}</h2>
          <p>Checking the Handle's on-chain ownership through Dingo.</p>
        </div>
      )}
      {query.error && (
        <p role="alert" className="text-sm text-red-400">
          {query.error.message}
        </p>
      )}
      {query.isSuccess &&
        (query.data ? (
          <div className="visual-empty">
            <span className="empty-orbit" aria-hidden="true">
              $
            </span>
            <h2>${handle}</h2>
            <p>Resolved address on this network</p>
            <p>
              <HashLink kind="address" id={query.data} full />
            </p>
          </div>
        ) : (
          <EmptyState
            icon="$"
            title="Handle not found"
            detail="Dingo has no active Handle token matching this name on the selected network."
          />
        ))}
    </Panel>
  );
}
