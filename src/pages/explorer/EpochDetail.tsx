import { Metric, Gauge, PageIntro } from "../../components/explorer/Visuals";
import { useNow } from "../../lib/useNow";
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
  const now = useNow(15_000);
  const path = epoch
    ? `/api/v0/epochs/${epoch}/parameters`
    : "/api/v0/epochs/latest/parameters";

  const tipQuery = useQuery({
    queryKey: ["dingo", "epoch-clock-tip"],
    queryFn: () =>
      blockfrostFetch<{ epoch: number; epoch_slot: number }>(
        "/api/v0/blocks/latest",
      ),
    refetchInterval: 30_000,
  });
  const erasQuery = useQuery({
    queryKey: ["dingo", "network", "eras"],
    queryFn: () =>
      blockfrostFetch<
        {
          start: { epoch: number; time: number };
          end: { epoch: number } | null;
          parameters: { epoch_length: number; slot_length: number };
        }[]
      >("/api/v0/network/eras"),
    staleTime: 60_000,
  });
  const selectedEpoch = epoch ? Number(epoch) : tipQuery.data?.epoch;
  const era = erasQuery.data?.find(
    (era) =>
      selectedEpoch !== undefined &&
      era.start.epoch <= selectedEpoch &&
      (!era.end || selectedEpoch < era.end.epoch),
  );
  const duration = era
    ? era.parameters.epoch_length * era.parameters.slot_length
    : undefined;
  const starts =
    era && selectedEpoch !== undefined && duration !== undefined
      ? era.start.time + (selectedEpoch - era.start.epoch) * duration
      : undefined;
  const ends =
    starts !== undefined && duration !== undefined
      ? starts + duration
      : undefined;
  const progress =
    starts !== undefined && ends !== undefined
      ? Math.min(
          100,
          Math.max(0, ((now / 1000 - starts) / (ends - starts)) * 100),
        )
      : undefined;
  const epochQuery = useQuery({
    queryKey: ["dingo", "epoch", selectedEpoch],
    queryFn: () =>
      blockfrostFetch<EpochResponse>(`/api/v0/epochs/${selectedEpoch}`),
    enabled:
      selectedEpoch !== undefined &&
      Number.isSafeInteger(selectedEpoch) &&
      selectedEpoch >= 0,
    staleTime: 60_000,
    refetchOnWindowFocus: false,
  });

  const paramsQuery = useQuery({
    queryKey: ["dingo", "epoch", epoch ?? "latest", "parameters"],
    queryFn: () => blockfrostFetch<ProtocolParamsResponse>(path),
  });

  return (
    <div className="flex flex-col gap-4">
      <PageIntro
        eyebrow="The network's heartbeat"
        title={epoch ? `Epoch ${epoch}` : "Against the clock."}
        detail="One cycle. Thousands of blocks. A network moving forward."
        symbol="◷"
      />
      <Panel
        title={
          selectedEpoch !== undefined
            ? `Epoch ${selectedEpoch}`
            : "Epoch timing"
        }
      >
        <QueryState
          isLoading={tipQuery.isLoading || erasQuery.isLoading}
          error={tipQuery.error || erasQuery.error}
        >
          {progress !== undefined &&
          starts !== undefined &&
          ends !== undefined ? (
            <>
              <div className="epoch-cockpit">
                <Gauge
                  label="Epoch elapsed"
                  value={progress}
                  detail={
                    selectedEpoch !== undefined
                      ? `Epoch ${selectedEpoch}`
                      : undefined
                  }
                />
                <div className="epoch-countdown">
                  <span className="eyebrow">
                    {progress >= 100 ? "Cycle complete" : "Time remaining"}
                  </span>
                  <strong>
                    {progress >= 100
                      ? "Complete"
                      : `${Math.floor(Math.max(0, ends - now / 1000) / 3600)}h ${Math.floor((Math.max(0, ends - now / 1000) % 3600) / 60)}m`}
                  </strong>
                  <span>
                    {((ends - starts) / 3600).toLocaleString()} hour cycle
                  </span>
                  <div
                    className="epoch-segments"
                    aria-label={`${progress.toFixed(1)} percent elapsed`}
                  >
                    {Array.from({ length: 40 }, (_, i) => (
                      <i
                        key={i}
                        className={i < progress / 2.5 ? "elapsed" : ""}
                      />
                    ))}
                  </div>
                </div>
              </div>
              <div className="mt-5 flex flex-wrap justify-between gap-4 text-xs text-slate-400">
                <span>Start · {new Date(starts * 1000).toLocaleString()}</span>
                <span>End · {new Date(ends * 1000).toLocaleString()}</span>
              </div>
            </>
          ) : (
            <p className="text-sm text-slate-400">
              No era timing is available for this epoch.
            </p>
          )}
        </QueryState>
      </Panel>
      <Panel title="Epoch activity totals">
        {epochQuery.isLoading ? (
          <div role="status" className="text-sm text-slate-400">
            <span className="live-dot" />
            Loading the epoch's aggregate activity… Timing and protocol
            parameters are available independently.
          </div>
        ) : (
          <QueryState
            isLoading={false}
            error={epochQuery.error}
            notFoundLabel="Epoch not found."
          >
            {epochQuery.data && (
              <div>
                <div className="metric-grid mb-4">
                  <Metric
                    label="Blocks"
                    value={epochQuery.data.block_count.toLocaleString()}
                  />
                  <Metric
                    label="Transactions"
                    value={epochQuery.data.tx_count.toLocaleString()}
                  />
                  <Metric
                    label="Fees"
                    value={formatAda(BigInt(epochQuery.data.fees))}
                  />
                </div>
                <Field
                  label="Output"
                  value={formatAda(BigInt(epochQuery.data.output))}
                />
                {epochQuery.data.active_stake && (
                  <Field
                    label="Active stake"
                    value={formatAda(BigInt(epochQuery.data.active_stake))}
                  />
                )}
              </div>
            )}
          </QueryState>
        )}
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
              <Field
                label="Max block size"
                value={`${paramsQuery.data.max_block_size} bytes`}
              />
              <Field
                label="Max tx size"
                value={`${paramsQuery.data.max_tx_size} bytes`}
              />
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
              <Field
                label="a0 / rho / tau"
                value={`${paramsQuery.data.a0} / ${paramsQuery.data.rho} / ${paramsQuery.data.tau}`}
              />
            </div>
          )}
        </QueryState>
      </Panel>
    </div>
  );
}
