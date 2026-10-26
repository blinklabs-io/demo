import { eraNameFromProtocol } from "../../lib/dingo/networkNames";
import { useQuery } from "@tanstack/react-query";
import { readHeaderVersion } from "../../lib/dingo/blockHeader";

export function BlockHeaderVersion({
  hash,
  slot,
}: {
  hash: string;
  slot: number;
}) {
  const query = useQuery({
    queryKey: ["dingo", "block-header-version", hash],
    queryFn: () => readHeaderVersion(hash, slot),
    staleTime: Infinity,
    retry: false,
  });
  if (query.isLoading)
    return (
      <span
        className="text-slate-400"
        aria-label="Loading block header version"
      >
        …
      </span>
    );
  if (query.error || !query.data)
    return (
      <span
        className="text-slate-400"
        title={
          query.error instanceof Error
            ? query.error.message
            : "Header unavailable"
        }
      >
        Unavailable
      </span>
    );
  return (
    <span
      className={`header-version ${query.data.minor === "69" ? "dingo-version" : ""}`}
      title={`${eraNameFromProtocol(Number(query.data.major))} · protocol version decoded from this block's header`}
    >
      {query.data.major}.{query.data.minor}
      {query.data.minor === "69" && <small>Dingo</small>}
    </span>
  );
}
