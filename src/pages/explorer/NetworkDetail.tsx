import { CapacityCockpit } from "../../components/explorer/CapacityCockpit";
import { EraName } from "../../components/explorer/EraName";
import { networkName } from "../../lib/dingo/networkNames";
import { compactAda, ratio } from "../../lib/visualFormat";
import { Distribution, Meter } from "../../components/explorer/Visuals";
import { useQuery } from "@tanstack/react-query";
import { Field, Panel } from "../../components/explorer/Panel";
import { QueryState } from "../../components/explorer/QueryState";
import { blockfrostFetch } from "../../lib/dingo/blockfrost";
import { formatNativeCoin, nativeTicker } from "../../lib/format";

interface NetworkResponse {
  supply: {
    max: string;
    total: string;
    circulating: string;
    locked: string;
    treasury: string;
    reserves: string;
  };
  stake: { live: string; active: string };
}

interface GenesisResponse {
  active_slots_coefficient: number;
  update_quorum: number;
  max_lovelace_supply: string;
  network_magic: number;
  epoch_length: number;
  system_start: number;
  slots_per_kes_period: number;
  slot_length: number;
  max_kes_evolutions: number;
  security_param: number;
}

interface NetworkEraBound {
  time: number;
  slot: number;
  epoch: number;
}

interface NetworkEraResponse {
  start: NetworkEraBound;
  end: NetworkEraBound | null;
  parameters: { epoch_length: number; slot_length: number; safe_zone: number };
}

function ada(value: string): string {
  return `${formatNativeCoin(BigInt(value))}`;
}

function date(value: number): string {
  return new Date(value * 1000).toLocaleString();
}

export default function NetworkDetail() {
  const networkQuery = useQuery({
    queryKey: ["dingo", "network"],
    queryFn: () => blockfrostFetch<NetworkResponse>("/api/v0/network"),
    refetchInterval: 60_000,
  });
  const genesisQuery = useQuery({
    queryKey: ["dingo", "genesis"],
    queryFn: () => blockfrostFetch<GenesisResponse>("/api/v0/genesis"),
    staleTime: Infinity,
  });
  const erasQuery = useQuery({
    queryKey: ["dingo", "network", "eras"],
    queryFn: () =>
      blockfrostFetch<NetworkEraResponse[]>("/api/v0/network/eras"),
    staleTime: Infinity,
  });

  const network = networkQuery.data;
  const genesis = genesisQuery.data;
  const eras = erasQuery.data;
  const currentTiming = eras?.at(-1);
  const supplyItems = network
    ? [
        {
          label: "Circulating",
          value: BigInt(network.supply.circulating),
          display: compactAda(network.supply.circulating),
        },
        {
          label: "Treasury",
          value: BigInt(network.supply.treasury),
          display: compactAda(network.supply.treasury),
        },
        {
          label: "Reserves",
          value: BigInt(network.supply.reserves),
          display: compactAda(network.supply.reserves),
        },
        {
          label: "Locked",
          value: BigInt(network.supply.locked),
          display: compactAda(network.supply.locked),
        },
      ]
    : [];

  const name = genesis ? networkName(genesis.network_magic) : "Network";
  return (
    <div className="network-dashboard">
      <header className="detail-header">
        <div>
          <h1>
            {name === "Preview" || name === "Preprod"
              ? `${name} network`
              : name}
          </h1>
          {genesis && (
            <p className="detail-id">
              {networkName(genesis.network_magic)}, network magic{" "}
              {genesis.network_magic}
            </p>
          )}
        </div>
      </header>

      <CapacityCockpit />

      <QueryState
        hasData={networkQuery.data !== undefined}
        isLoading={networkQuery.isLoading}
        error={networkQuery.error}
      >
        {network && (
          <div className="visual-grid wide-left">
            <Panel title={`${nativeTicker()} supply`}>
              <Distribution
                title="Maximum supply"
                unit={compactAda(network.supply.max)}
                items={supplyItems}
              />
              <Meter
                label={`Issued: ${compactAda(network.supply.total)} of the maximum`}
                value={ratio(
                  BigInt(network.supply.total),
                  BigInt(network.supply.max),
                )}
              />
            </Panel>
            <Panel title="Stake">
              <div className="epoch-timing">
                <div>
                  <span className="field-label">Live stake</span>
                  <strong title={ada(network.stake.live)}>
                    {compactAda(network.stake.live)}
                  </strong>
                </div>
                <div>
                  <span className="field-label">Active stake</span>
                  <strong title={ada(network.stake.active)}>
                    {compactAda(network.stake.active)}
                  </strong>
                </div>
              </div>
              <Meter
                label={`Live stake as a share of issued ${nativeTicker()}`}
                value={ratio(
                  BigInt(network.stake.live),
                  BigInt(network.supply.total),
                )}
              />
              <p className="tool-help">
                Live stake reflects current delegation. Active stake is the
                snapshot used for the epoch.
              </p>
            </Panel>
          </div>
        )}
      </QueryState>

      <Panel title="Slot and epoch timing">
        <QueryState
          hasData={erasQuery.data !== undefined}
          isLoading={erasQuery.isLoading}
          error={erasQuery.error}
        >
          {currentTiming && (
            <div className="epoch-timing">
              <div>
                <span className="field-label">Slot length</span>
                <strong>{currentTiming.parameters.slot_length} s</strong>
              </div>
              <div>
                <span className="field-label">Slots per epoch</span>
                <strong>
                  {currentTiming.parameters.epoch_length.toLocaleString()}
                </strong>
              </div>
              <div>
                <span className="field-label">Epoch length</span>
                <strong>
                  {(
                    (currentTiming.parameters.epoch_length *
                      currentTiming.parameters.slot_length) /
                    3600
                  ).toLocaleString()}{" "}
                  hours
                </strong>
              </div>
            </div>
          )}
        </QueryState>
      </Panel>

      <Panel title="Protocol timing by era">
        <QueryState
          hasData={erasQuery.data !== undefined}
          isLoading={erasQuery.isLoading}
          error={erasQuery.error}
        >
          <div className="overflow-x-auto">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Era</th>
                  <th>Started</th>
                  <th className="num">First epoch</th>
                  <th className="num">Start slot</th>
                  <th className="num">Slots per epoch</th>
                  <th className="num">Slot length</th>
                  <th>Ended</th>
                </tr>
              </thead>
              <tbody>
                {(eras ?? []).map((era) => (
                  <tr key={era.start.slot}>
                    <td className="table-strong">
                      <EraName epoch={era.start.epoch} />
                    </td>
                    <td>
                      <time
                        dateTime={new Date(era.start.time * 1000).toISOString()}
                        title={date(era.start.time)}
                      >
                        {new Date(era.start.time * 1000).toLocaleDateString(
                          undefined,
                          { month: "short", day: "numeric", year: "numeric" },
                        )}
                      </time>
                    </td>
                    <td className="num">
                      {era.start.epoch.toLocaleString()}
                    </td>
                    <td className="num">{era.start.slot.toLocaleString()}</td>
                    <td className="num">
                      {era.parameters.epoch_length.toLocaleString()}
                    </td>
                    <td className="num">{era.parameters.slot_length} s</td>
                    <td>{era.end ? date(era.end.time) : "Current"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </QueryState>
      </Panel>

      <div className="network-reference">
        <details className="detail-disclosure">
          <summary>Exact monetary values</summary>
          {network && (
            <div className="field-grid">
              {[
                ["Maximum supply", network.supply.max],
                ["Total supply", network.supply.total],
                ["Circulating", network.supply.circulating],
                ["Locked", network.supply.locked],
                ["Treasury", network.supply.treasury],
                ["Reserves", network.supply.reserves],
                ["Live stake", network.stake.live],
                ["Active stake", network.stake.active],
              ].map(([label, value]) => (
                <Field key={label} label={label} value={ada(value)} />
              ))}
            </div>
          )}
        </details>
        <details className="detail-disclosure">
          <summary>Genesis configuration</summary>
          <QueryState
            hasData={genesisQuery.data !== undefined}
            isLoading={genesisQuery.isLoading}
            error={genesisQuery.error}
          >
            {genesis && (
              <div className="field-grid">
                <Field
                  label="System start"
                  value={date(genesis.system_start)}
                />
                <Field label="Network magic" value={genesis.network_magic} />
                <Field
                  label="Maximum supply"
                  value={ada(genesis.max_lovelace_supply)}
                />
                <Field
                  label="Epoch length"
                  value={`${genesis.epoch_length.toLocaleString()} slots`}
                />
                <Field label="Slot length" value={`${genesis.slot_length}s`} />
                <Field
                  label="Active slots coefficient"
                  value={genesis.active_slots_coefficient}
                />
                <Field
                  label="Security parameter"
                  value={genesis.security_param}
                />
                <Field
                  label="KES period"
                  value={`${genesis.slots_per_kes_period.toLocaleString()} slots`}
                />
                <Field
                  label="Maximum KES evolutions"
                  value={genesis.max_kes_evolutions}
                />
                <Field label="Update quorum" value={genesis.update_quorum} />
              </div>
            )}
          </QueryState>
        </details>
      </div>
    </div>
  );
}
