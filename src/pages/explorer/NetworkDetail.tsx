import { EraName } from "../../components/explorer/EraName";
import { networkName } from "../../lib/dingo/networkNames";
import { compactAda, ratio } from "../../lib/visualFormat";
import { Distribution, Meter, Gauge } from "../../components/explorer/Visuals";
import { useQuery } from "@tanstack/react-query";
import { Field } from "../../components/explorer/Panel";
import { QueryState } from "../../components/explorer/QueryState";
import { blockfrostFetch } from "../../lib/dingo/blockfrost";
import { formatAda } from "../../lib/format";

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
  return `${formatAda(BigInt(value))}`;
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
      <header className="network-heading">
        <div>
          <span className="eyebrow">The economics of the chain</span>
          <h1>
            {name === "Preview" || name === "Preprod"
              ? `${name} network`
              : name}
          </h1>
        </div>
        {genesis && (
          <span
            className="network-id"
            title={`Network magic ${genesis.network_magic}`}
          >
            <span aria-hidden="true">◎</span>
            <strong>{networkName(genesis.network_magic)}</strong>
          </span>
        )}
      </header>

      <QueryState isLoading={networkQuery.isLoading} error={networkQuery.error}>
        {network && (
          <div className="network-economics">
            <section className="network-supply">
              <div className="network-section-heading">
                <span className="eyebrow">ADA distribution</span>
                <span className="network-unit">₳</span>
              </div>
              <h2>Where the ADA is</h2>
              <Distribution
                title="Maximum supply"
                unit={compactAda(network.supply.max)}
                items={supplyItems}
              />
              <div className="supply-release">
                <div>
                  <span className="eyebrow">Issued supply</span>
                  <strong>{compactAda(network.supply.total)}</strong>
                </div>
                <Meter
                  label="Issued / maximum"
                  value={ratio(
                    BigInt(network.supply.total),
                    BigInt(network.supply.max),
                  )}
                />
              </div>
            </section>
            <section className="network-staking">
              <span className="eyebrow">Participation</span>
              <h2>Stake in the network</h2>
              <div
                className="stake-comparison"
                role="img"
                aria-label={`Live stake ${ada(network.stake.live)}; active stake ${ada(network.stake.active)}`}
              >
                {[
                  {
                    label: "Live stake",
                    value: network.stake.live,
                    className: "live",
                  },
                  {
                    label: "Active stake",
                    value: network.stake.active,
                    className: "active",
                  },
                ].map((item) => (
                  <div
                    className={`stake-column ${item.className}`}
                    key={item.label}
                  >
                    <strong title={ada(item.value)}>
                      {compactAda(item.value)}
                    </strong>
                    <div className="stake-column-track">
                      <span
                        style={{
                          height: `${ratio(BigInt(item.value), BigInt(network.stake.live) > BigInt(network.stake.active) ? BigInt(network.stake.live) : BigInt(network.stake.active))}%`,
                        }}
                      />
                    </div>
                    <span>{item.label}</span>
                  </div>
                ))}
              </div>
              <Gauge
                label="Live stake / issued supply"
                value={ratio(
                  BigInt(network.stake.live),
                  BigInt(network.supply.total),
                )}
                detail="Current delegation as a share of issued ADA"
                tone="violet"
              />
              <div className="stake-footnote">
                <span className="legend-dot" />
                <p>
                  Live stake reflects current delegation. Active stake is the
                  snapshot used for the epoch.
                </p>
              </div>
            </section>
          </div>
        )}
      </QueryState>

      <section className="network-clock">
        <div className="network-clock-heading">
          <div>
            <span className="eyebrow">How the chain keeps time</span>
            <h2>Network rhythm</h2>
          </div>
          <span className="clock-orbit" aria-hidden="true">
            ◷
          </span>
        </div>
        <QueryState isLoading={erasQuery.isLoading} error={erasQuery.error}>
          {currentTiming && (
            <div className="rhythm-grid">
              <div>
                <strong>
                  {currentTiming.parameters.slot_length}
                  <small>s</small>
                </strong>
                <span>per slot</span>
                <div className="slot-pulses" aria-hidden="true">
                  {Array.from({ length: 18 }, (_, i) => (
                    <i key={i} />
                  ))}
                </div>
              </div>
              <div>
                <strong>
                  {currentTiming.parameters.epoch_length.toLocaleString()}
                </strong>
                <span>slots per epoch</span>
                <div className="epoch-stripes" aria-hidden="true" />
              </div>
              <div>
                <strong>
                  {(
                    (currentTiming.parameters.epoch_length *
                      currentTiming.parameters.slot_length) /
                    3600
                  ).toLocaleString()}
                  <small>h</small>
                </strong>
                <span>per epoch</span>
                <div className="epoch-clock" aria-hidden="true" />
              </div>
            </div>
          )}
        </QueryState>
      </section>

      <section className="network-history">
        <div className="network-section-heading">
          <div>
            <span className="eyebrow">Protocol timing</span>
            <h2>Across the eras</h2>
          </div>
          <span className="network-unit">↗</span>
        </div>
        <QueryState isLoading={erasQuery.isLoading} error={erasQuery.error}>
          <ol className="era-track">
            {(eras ?? []).map((era, index) => (
              <li key={era.start.slot}>
                <div className="era-station">
                  <span>{String(index + 1).padStart(2, "0")}</span>
                  <i />
                </div>
                <h3>
                  <EraName epoch={era.start.epoch} />
                </h3>
                <time dateTime={new Date(era.start.time * 1000).toISOString()}>
                  {new Date(era.start.time * 1000).toLocaleDateString(
                    undefined,
                    { month: "short", day: "numeric", year: "numeric" },
                  )}
                </time>
                <div className="era-origin">
                  <span>Begins at epoch</span>
                  <strong>{era.start.epoch.toLocaleString()}</strong>
                </div>
                <details>
                  <summary>Timing boundaries</summary>
                  <dl>
                    <dt>Start slot</dt>
                    <dd>{era.start.slot.toLocaleString()}</dd>
                    <dt>Start time</dt>
                    <dd>{date(era.start.time)}</dd>
                    <dt>End boundary</dt>
                    <dd>{era.end ? date(era.end.time) : "Open"}</dd>
                    <dt>Slots / epoch</dt>
                    <dd>{era.parameters.epoch_length.toLocaleString()}</dd>
                    <dt>Slot duration</dt>
                    <dd>{era.parameters.slot_length}s</dd>
                  </dl>
                </details>
              </li>
            ))}
          </ol>
        </QueryState>
      </section>

      <div className="network-reference">
        <details className="detail-disclosure">
          <summary>Exact monetary values</summary>
          {network && (
            <div className="network-value-grid">
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
            isLoading={genesisQuery.isLoading}
            error={genesisQuery.error}
          >
            {genesis && (
              <div className="network-value-grid">
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
