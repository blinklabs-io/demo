import { Link } from "react-router";
import { useQuery } from "@tanstack/react-query";
import { blockfrostFetch } from "../../lib/dingo/blockfrost";
import { useNodeHealth } from "../../lib/dingo/nodeHealth";
import { compactAda, epochProgress } from "../../lib/visualFormat";
import { Panel } from "./Panel";
import { QueryState } from "./QueryState";
import { Distribution, Gauge } from "./Visuals";
interface Network {
  supply: {
    max: string;
    circulating: string;
    treasury: string;
    reserves: string;
    locked: string;
  };
}
export function ChainSnapshot() {
  const health = useNodeHealth();
  const network = useQuery({
    queryKey: ["dingo", "network"],
    queryFn: ({ signal }) =>
      blockfrostFetch<Network>("/api/v0/network", { signal }),
    refetchInterval: 60000,
  });
  const genesis = useQuery({
    queryKey: ["dingo", "genesis"],
    queryFn: ({ signal }) =>
      blockfrostFetch<{ epoch_length: number }>("/api/v0/genesis", { signal }),
    staleTime: Infinity,
  });
  const progress = epochProgress(
    health.data?.tipEpochSlot,
    genesis.data?.epoch_length,
  );
  return (
    <section className="discover-snapshot" aria-label="Live network snapshot">
      <header className="experience-section-heading">
        <div>
          <span className="eyebrow">Live from Dingo</span>
          <h2>Preview, right now.</h2>
        </div>
        <Link to="/explorer">Explore the chain →</Link>
      </header>
      <div className="visual-grid">
        <Panel
          title={
            health.data ? `Epoch ${health.data.tipEpoch}` : "Epoch progress"
          }
          action={
            <Link className="text-xs text-sky-400" to="/explorer/epoch">
              Explore epoch ↗
            </Link>
          }
        >
          <QueryState hasData={Boolean(health.data && genesis.data)}
            isLoading={health.isLoading || genesis.isLoading}
            error={health.error || genesis.error}
          >
            {progress !== null && health.data ? (
              <Gauge
                label="Epoch elapsed"
                value={progress}
                detail={`${health.data.tipEpochSlot.toLocaleString()} of ${genesis.data!.epoch_length.toLocaleString()} slots`}
              />
            ) : (
              <p className="tool-help">Epoch timing is unavailable.</p>
            )}
          </QueryState>
        </Panel>
        <Panel
          title="ADA supply"
          action={
            <Link className="text-xs text-sky-400" to="/explorer/network">
              Network ↗
            </Link>
          }
        >
          <QueryState hasData={network.data !== undefined} isLoading={network.isLoading} error={network.error}>
            {network.data && (
              <Distribution
                title="ADA supply"
                unit={compactAda(network.data.supply.max)}
                items={(
                  [
                    ["circulating", "Circulating"],
                    ["treasury", "Treasury"],
                    ["reserves", "Reserves"],
                    ["locked", "Locked"],
                  ] as const
                ).map(([key, label]) => ({
                  label,
                  value: BigInt(network.data!.supply[key]),
                  display: compactAda(network.data!.supply[key]),
                }))}
              />
            )}
          </QueryState>
        </Panel>
      </div>
    </section>
  );
}
