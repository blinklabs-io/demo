import { useParams } from "react-router";
import { useQuery } from "@tanstack/react-query";
import { blockfrostFetch } from "../../lib/dingo/blockfrost";
import { Panel, Field } from "../../components/explorer/Panel";
import { QueryState } from "../../components/explorer/QueryState";
import { formatAda } from "../../lib/format";

interface EpochResponse {
  epoch: number;
  start_time: number;
  end_time: number;
  first_block_time: number;
  last_block_time: number;
  block_count: number;
  tx_count: number;
  output: string;
  fees: string;
  active_stake: string | null;
}

interface ProtocolParamsResponse {
  epoch: number;
  min_fee_a: number;
  min_fee_b: number;
  max_block_size: number;
  max_tx_size: number;
  key_deposit: string;
  pool_deposit: string;
  a0: number;
  rho: number;
  tau: number;
  protocol_major_ver: number;
  protocol_minor_ver: number;
  min_pool_cost: string;
}

export default function EpochDetail() {
  const { epoch } = useParams();
  const path = epoch ? `/api/v0/epochs/${epoch}/parameters` : "/api/v0/epochs/latest/parameters";

  const epochQuery = useQuery({
    queryKey: ["dingo", "epoch", epoch ?? "latest"],
    queryFn: () =>
      blockfrostFetch<EpochResponse>(
        epoch ? `/api/v0/epochs/${epoch}` : "/api/v0/epochs/latest",
      ),
  });

  const paramsQuery = useQuery({
    queryKey: ["dingo", "epoch", epoch ?? "latest", "parameters"],
    queryFn: () => blockfrostFetch<ProtocolParamsResponse>(path),
  });

  return (
    <div className="flex flex-col gap-4">
      <Panel title={epoch ? `Epoch ${epoch}` : "Current epoch"}>
        <QueryState
          isLoading={epochQuery.isLoading}
          error={epochQuery.error}
          notFoundLabel="Epoch not found."
        >
          {epochQuery.data && (
            <div>
              <Field label="Epoch" value={epochQuery.data.epoch} />
              <Field
                label="Start"
                value={new Date(epochQuery.data.start_time * 1000).toLocaleString()}
              />
              <Field
                label="End"
                value={new Date(epochQuery.data.end_time * 1000).toLocaleString()}
              />
              <Field label="Blocks" value={epochQuery.data.block_count} />
              <Field label="Transactions" value={epochQuery.data.tx_count} />
              <Field label="Output" value={formatAda(BigInt(epochQuery.data.output))} />
              <Field label="Fees" value={formatAda(BigInt(epochQuery.data.fees))} />
              {epochQuery.data.active_stake && (
                <Field
                  label="Active stake"
                  value={formatAda(BigInt(epochQuery.data.active_stake))}
                />
              )}
            </div>
          )}
        </QueryState>
      </Panel>

      <Panel title="Protocol parameters">
        <QueryState isLoading={paramsQuery.isLoading} error={paramsQuery.error}>
          {paramsQuery.data && (
            <div>
              <Field
                label="Protocol version"
                value={`${paramsQuery.data.protocol_major_ver}.${paramsQuery.data.protocol_minor_ver}`}
              />
              <Field label="Min fee A" value={paramsQuery.data.min_fee_a} />
              <Field label="Min fee B" value={paramsQuery.data.min_fee_b} />
              <Field label="Max block size" value={`${paramsQuery.data.max_block_size} bytes`} />
              <Field label="Max tx size" value={`${paramsQuery.data.max_tx_size} bytes`} />
              <Field
                label="Key deposit"
                value={formatAda(BigInt(paramsQuery.data.key_deposit))}
              />
              <Field
                label="Pool deposit"
                value={formatAda(BigInt(paramsQuery.data.pool_deposit))}
              />
              <Field
                label="Min pool cost"
                value={formatAda(BigInt(paramsQuery.data.min_pool_cost))}
              />
              <Field label="a0 / rho / tau" value={`${paramsQuery.data.a0} / ${paramsQuery.data.rho} / ${paramsQuery.data.tau}`} />
            </div>
          )}
        </QueryState>
      </Panel>
    </div>
  );
}
