import { useParams } from "react-router";
import { Panel } from "../../components/explorer/Panel";
import { HashLink } from "../../components/explorer/HashLink";
import { PaginatedList } from "../../components/explorer/PaginatedList";

interface MetadataJsonRow {
  tx_hash: string;
  json_metadata: unknown;
}

interface MetadataCborRow {
  tx_hash: string;
  cbor_metadata: string | null;
  metadata: string;
}

export default function MetadataLabel() {
  const { label } = useParams();
  const encodedLabel = encodeURIComponent(label ?? "");

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="text-xl font-semibold text-white">Transaction metadata label {label}</h1>
        <p className="mt-1 text-sm text-slate-400">Browse the indexed JSON and CBOR values for this label.</p>
      </div>

      <Panel title="JSON metadata">
        <PaginatedList<MetadataJsonRow>
          queryKey={["dingo", "metadata-label", label, "json"]}
          buildUrl={(page, count) => `/api/v0/metadata/txs/labels/${encodedLabel}?page=${page}&count=${count}&order=desc`}
          keyFor={(row) => row.tx_hash}
          emptyLabel="No transactions use this metadata label."
          renderItem={(row) => (
            <div className="rounded border border-slate-800 p-2">
              <HashLink kind="tx" id={row.tx_hash} visible={14} />
              <pre className="mt-2 max-h-64 overflow-auto whitespace-pre-wrap break-all text-xs text-slate-400">{JSON.stringify(row.json_metadata, null, 2)}</pre>
            </div>
          )}
        />
      </Panel>

      <Panel title="CBOR metadata">
        <PaginatedList<MetadataCborRow>
          queryKey={["dingo", "metadata-label", label, "cbor"]}
          buildUrl={(page, count) => `/api/v0/metadata/txs/labels/${encodedLabel}/cbor?page=${page}&count=${count}&order=desc`}
          keyFor={(row) => row.tx_hash}
          emptyLabel="No CBOR metadata found for this label."
          renderItem={(row) => (
            <div className="rounded border border-slate-800 p-2">
              <HashLink kind="tx" id={row.tx_hash} visible={14} />
              <pre className="mt-2 max-h-40 overflow-auto whitespace-pre-wrap break-all font-mono text-xs text-slate-400">{row.cbor_metadata ?? row.metadata}</pre>
            </div>
          )}
        />
      </Panel>
    </div>
  );
}
