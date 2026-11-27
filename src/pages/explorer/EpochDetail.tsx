import { lazy, Suspense } from "react";
import {
  epochSummaryQuery,
  useRefetchOnEpochCompletion,
} from "../../lib/explorer/epochSummary";
import { EpochFingerprints } from "../../components/chain/EpochFingerprints";
import { eraNameFromProtocol } from "../../lib/dingo/networkNames";
import {
  EmptyState,
} from "../../components/explorer/Visuals";
import { useNow } from "../../lib/useNow";
import { Link } from "../../components/NetworkLink";
import { RollingNumber } from "../../components/RollingNumber";
import { useParams } from "react-router";

const EpochRing = lazy(() => import("../../components/chain/EpochRing"));
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { blockfrostFetch } from "../../lib/dingo/blockfrost";
import { Panel, Field } from "../../components/explorer/Panel";
import { QueryState } from "../../components/explorer/QueryState";
import { formatNativeCoin } from "../../lib/format";

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
  const queryClient = useQueryClient();
  const invalidEpoch =
    epoch !== undefined &&
    (!/^\d+$/.test(epoch) ||
      !Number.isSafeInteger(Number(epoch)) ||
      Number(epoch) < 0);
  const now = useNow(15_000);
  const tipQuery = useQuery({
    queryKey: ["dingo", "epoch-clock-tip"],
    queryFn: () =>
      blockfrostFetch<{ epoch: number; epoch_slot: number }>(
        "/api/v0/blocks/latest",
      ),
    refetchInterval: 30_000,
    enabled: !invalidEpoch,
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
    enabled: !invalidEpoch,
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
    ...epochSummaryQuery(selectedEpoch, tipQuery.data?.epoch),
    enabled:
      !invalidEpoch &&
      selectedEpoch !== undefined &&
      Number.isSafeInteger(selectedEpoch) &&
      selectedEpoch >= 0,
  });
  useRefetchOnEpochCompletion(
    selectedEpoch,
    tipQuery.data?.epoch,
    epochQuery.refetch,
    !invalidEpoch,
  );

  const paramsQuery = useQuery({
    queryKey: [
      "dingo",
      "epoch",
      epoch === undefined ? "latest" : String(selectedEpoch),
      "parameters",
    ],
    queryFn: ({ signal }) =>
      blockfrostFetch<ProtocolParamsResponse>(
        `/api/v0/epochs/${epoch === undefined ? "latest" : selectedEpoch}/parameters`,
        { signal },
      ),
    enabled: !invalidEpoch,
    refetchInterval: epoch === undefined ? 30_000 : false,
  });

  if (invalidEpoch)
    return (
      <Panel title="Epoch">
        <EmptyState
          title="Epoch not found."
          detail="Enter a non-negative whole epoch number."
        />
      </Panel>
    );

  return (
    <div className="flex flex-col gap-4">
      <header className="detail-header">
        <h1>
          {selectedEpoch !== undefined
            ? `Epoch ${selectedEpoch.toLocaleString()}`
            : "Epoch"}
        </h1>
        {selectedEpoch !== undefined && (
          <nav aria-label="Adjacent epochs">
            {selectedEpoch > 0 ? (
              <Link to={`/explorer/epoch/${selectedEpoch - 1}`}>Previous</Link>
            ) : (
              <span>First epoch</span>
            )}
            {tipQuery.data && selectedEpoch < tipQuery.data.epoch ? (
              <Link to={`/explorer/epoch/${selectedEpoch + 1}`}>Next</Link>
            ) : (
              <span>Current epoch</span>
            )}
          </nav>
        )}
      </header>
      <Panel title="Timing">
        <QueryState
          hasData={Boolean(era && selectedEpoch !== undefined)}
          isLoading={
            (epoch === undefined && tipQuery.isLoading) || erasQuery.isLoading
          }
          error={
            (epoch === undefined ? tipQuery.error : null) || erasQuery.error
          }
        >
          {progress !== undefined &&
          starts !== undefined &&
          ends !== undefined ? (
            <div className="epoch-hero">
              <div>
              <div className="epoch-timing">
                <div>
                  <span className="field-label">Elapsed</span>
                  <strong>
                    <RollingNumber
                      value={`${Math.min(100, progress).toFixed(1)}%`}
                    />
                  </strong>
                </div>
                <div>
                  <span className="field-label">
                    {progress >= 100 ? "Status" : "Time remaining"}
                  </span>
                  <strong>
                    <RollingNumber
                      value={
                        progress >= 100
                          ? "Complete"
                          : `${Math.floor(Math.max(0, ends - now / 1000) / 3600)}h ${Math.floor((Math.max(0, ends - now / 1000) % 3600) / 60)}m`
                      }
                    />
                  </strong>
                </div>
                <div>
                  <span className="field-label">Length</span>
                  <strong>
                    {((ends - starts) / 3600).toLocaleString()} hours
                  </strong>
                </div>
              </div>
              <div
                className="epoch-track"
                role="meter"
                aria-label="Epoch elapsed"
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={Math.min(100, Math.round(progress))}
              >
                <i style={{ width: `${Math.min(100, progress)}%` }} />
              </div>
              <div className="epoch-bounds">
                <span>{new Date(starts * 1000).toLocaleString()}</span>
                <span>{new Date(ends * 1000).toLocaleString()}</span>
              </div>
              </div>
              <Suspense fallback={null}>
                <EpochRing progress={Math.min(100, progress)} />
              </Suspense>
            </div>
          ) : (
            <p className="text-sm text-slate-400">
              No era timing is available for this epoch.
            </p>
          )}
        </QueryState>
      </Panel>
      <Panel
        title="Epoch activity totals"
        action={
          <button
            type="button"
            className="button-secondary"
            disabled={selectedEpoch === undefined || epochQuery.isFetching}
            onClick={() =>
              void queryClient.invalidateQueries({
                queryKey: epochSummaryQuery(selectedEpoch, tipQuery.data?.epoch)
                  .queryKey,
                exact: true,
              })
            }
          >
            {epochQuery.isFetching ? "Reading totals…" : "Refresh totals"}
          </button>
        }
      >
        {epochQuery.data && (
          <p className="tool-help">
            Read {new Date(epochQuery.data.observedAt).toLocaleString()} ·{" "}
            {tipQuery.data?.epoch === undefined
              ? "completion unverified"
              : epochQuery.data.epoch < tipQuery.data.epoch
                ? "completed epoch"
                : "partial epoch snapshot"}
          </p>
        )}
        {epochQuery.isLoading ? (
          <div role="status" className="text-sm text-slate-400">
            <span className="live-dot" />
            Loading the epoch's aggregate activity… Timing and protocol
            parameters are available independently.
          </div>
        ) : (
          <QueryState
            hasData={epochQuery.data !== undefined}
            isLoading={false}
            error={epochQuery.error}
            notFoundLabel="Epoch not found."
          >
            {epochQuery.data && (
              <div className="field-grid">
                <Field
                  label="Blocks"
                  value={epochQuery.data.block_count.toLocaleString()}
                />
                <Field
                  label="Transactions"
                  value={epochQuery.data.tx_count.toLocaleString()}
                />
                <Field
                  label="Fees"
                  value={formatNativeCoin(BigInt(epochQuery.data.fees))}
                />
                <Field
                  label="Output"
                  value={formatNativeCoin(BigInt(epochQuery.data.output))}
                />
                {epochQuery.data.active_stake && (
                  <Field
                    label="Active stake"
                    value={formatNativeCoin(BigInt(epochQuery.data.active_stake))}
                  />
                )}
              </div>
            )}
          </QueryState>
        )}
      </Panel>

      {selectedEpoch !== undefined && (
        <EpochFingerprints
          epoch={selectedEpoch}
          currentEpoch={tipQuery.data?.epoch}
        />
      )}

      <Panel title="Protocol parameters">
        <QueryState
          hasData={paramsQuery.data !== undefined}
          isLoading={paramsQuery.isLoading}
          error={paramsQuery.error}
        >
          {paramsQuery.data && (
            <div className="field-grid">
              <Field
                label="Era"
                value={eraNameFromProtocol(paramsQuery.data.protocol_major_ver)}
              />
              <Field
                label="Protocol version"
                value={`${paramsQuery.data.protocol_major_ver}.${paramsQuery.data.protocol_minor_ver}`}
              />
              <Field label="Min fee A" value={paramsQuery.data.min_fee_a} />
              <Field label="Min fee B" value={paramsQuery.data.min_fee_b} />
              <Field
                label="Max block size"
                value={`${paramsQuery.data.max_block_size.toLocaleString()} bytes`}
              />
              <Field
                label="Max tx size"
                value={`${paramsQuery.data.max_tx_size.toLocaleString()} bytes`}
              />
              <Field
                label="Key deposit"
                value={formatNativeCoin(BigInt(paramsQuery.data.key_deposit))}
              />
              <Field
                label="Pool deposit"
                value={formatNativeCoin(BigInt(paramsQuery.data.pool_deposit))}
              />
              <Field
                label="Min pool cost"
                value={formatNativeCoin(BigInt(paramsQuery.data.min_pool_cost))}
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
