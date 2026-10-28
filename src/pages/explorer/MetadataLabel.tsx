import { PageIntro } from "../../components/explorer/Visuals";
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

function MetadataDocument({ value }: { value: unknown }) {
  const messages =
    value &&
    typeof value === "object" &&
    "msg" in value &&
    Array.isArray(value.msg) &&
    value.msg.every((item: unknown) => typeof item === "string")
      ? (value.msg as string[])
      : undefined;
  if (messages)
    return (
      <>
        <blockquote className="chain-message">
          {messages.map((message, index) => (
            <p key={index}>{message}</p>
          ))}
        </blockquote>
        <details className="technical-details">
          <summary>Raw JSON</summary>
          <pre>{JSON.stringify(value, null, 2)}</pre>
        </details>
      </>
    );
  return (
    <pre className="mt-2 max-h-64 overflow-auto whitespace-pre-wrap break-all text-xs text-slate-400">
      {JSON.stringify(value, null, 2)}
    </pre>
  );
}

export default function MetadataLabel() {
  const { label } = useParams();
  const encodedLabel = encodeURIComponent(label ?? "");

  return (
    <div className="flex flex-col gap-4">
      <PageIntro
        eyebrow="Written into the chain"
        title={`Metadata · ${label}`}
        detail="Messages and structured data, preserved on chain."
        symbol="{ }"
      />
      <Panel title="JSON metadata">
        <PaginatedList<MetadataJsonRow>
          queryKey={["dingo", "metadata-label", label, "json"]}
          buildUrl={(page, count) =>
            `/api/v0/metadata/txs/labels/${encodedLabel}?page=${page}&count=${count}&order=desc`
          }
          keyFor={(row) => row.tx_hash}
          emptyLabel="No transactions use this metadata label."
          renderItem={(row) => (
            <div className="metadata-card">
              <HashLink kind="tx" id={row.tx_hash} visible={14} />
              <MetadataDocument value={row.json_metadata} />
            </div>
          )}
        />
      </Panel>

      <details className="detail-disclosure">
        <summary>Serialized CBOR metadata</summary>
        <Panel title="CBOR metadata">
          <PaginatedList<MetadataCborRow>
            queryKey={["dingo", "metadata-label", label, "cbor"]}
            buildUrl={(page, count) =>
              `/api/v0/metadata/txs/labels/${encodedLabel}/cbor?page=${page}&count=${count}&order=desc`
            }
            keyFor={(row) => row.tx_hash}
            emptyLabel="No CBOR metadata found for this label."
            renderItem={(row) => (
              <div className="metadata-card">
                <HashLink kind="tx" id={row.tx_hash} visible={14} />
                <pre className="mt-2 max-h-40 overflow-auto whitespace-pre-wrap break-all font-mono text-xs text-slate-400">
                  {row.cbor_metadata ?? row.metadata}
                </pre>
              </div>
            )}
          />
        </Panel>
      </details>
    </div>
  );
}
