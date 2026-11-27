import { nativeTicker } from "../../lib/format";
import { DINGO_NETWORK } from "../../lib/dingo/config";
import { Link } from "../NetworkLink";
import { useQuery } from "@tanstack/react-query";
import { blockfrostFetch } from "../../lib/dingo/blockfrost";
import { useNodeHealth } from "../../lib/dingo/nodeHealth";
import { compactAda, epochProgress } from "../../lib/visualFormat";
import { Panel } from "./Panel";
import { QueryState } from "./QueryState";
import { Gauge } from "./Visuals";
import { lazy, Suspense } from "react";

const EpochRing = lazy(() => import("../chain/EpochRing"));
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
      blockfrostFetch<{ epoch_length: number; slot_length?: number }>(
        "/api/v0/genesis",
        { signal },
      ),
    staleTime: Infinity,
  });
  const progress = epochProgress(
    health.data?.tipEpochSlot,
    genesis.data?.epoch_length,
  );
  // Time left in the epoch, from the genesis slot length when Dingo reports it.
  const secondsLeft =
    health.data && genesis.data?.slot_length
      ? Math.max(0, genesis.data.epoch_length - health.data.tipEpochSlot) *
        genesis.data.slot_length
      : null;
  const left =
    secondsLeft === null
      ? ""
      : secondsLeft >= 7200
        ? ` · about ${Math.round(secondsLeft / 3600)} hours left`
        : ` · about ${Math.max(1, Math.round(secondsLeft / 60))} minutes left`;
  const supply = network.data
    ? (
        [
          ["circulating", "Circulating"],
          ["treasury", "Treasury"],
          ["reserves", "Reserves"],
          ["locked", "Locked"],
        ] as const
      ).map(([key, label]) => ({
        label,
        value: BigInt(network.data.supply[key]),
        display: compactAda(network.data.supply[key]),
      }))
    : [];
  const supplyTotal = supply.reduce((sum, item) => sum + item.value, 0n);
  const share = (value: bigint) =>
    supplyTotal > 0n ? Number((value * 1000n) / supplyTotal) / 10 : 0;
  return (
    <section className="discover-snapshot" aria-label="Live network snapshot">
      <header className="experience-section-heading">
        <div>
          <h2>{DINGO_NETWORK.label}, live from Dingo</h2>
        </div>
        <Link to="/explorer">Explore the chain</Link>
      </header>
      <div className="visual-grid">
        <Panel
          title={
            health.data ? `Epoch ${health.data.tipEpoch}` : "Epoch progress"
          }
          action={
            <Link className="text-xs text-sky-400" to="/explorer/epoch">
              Explore epoch
            </Link>
          }
        >
          <QueryState hasData={Boolean(health.data && genesis.data)}
            isLoading={health.isLoading || genesis.isLoading}
            error={health.error || genesis.error}
          >
            {progress !== null && health.data ? (
              <div className="snapshot-epoch">
                <Suspense fallback={null}>
                  <EpochRing progress={Math.min(100, progress)} />
                </Suspense>
                <Gauge
                  label="Epoch elapsed"
                  value={progress}
                  detail={`${health.data.tipEpochSlot.toLocaleString()} of ${genesis.data!.epoch_length.toLocaleString()} slots${left}`}
                />
              </div>
            ) : (
              <p className="tool-help">Epoch timing is unavailable.</p>
            )}
          </QueryState>
        </Panel>
        <Panel
          title={`${nativeTicker()} supply`}
          action={
            <Link className="text-xs text-sky-400" to="/explorer/network">
              Network
            </Link>
          }
        >
          <QueryState hasData={network.data !== undefined} isLoading={network.isLoading} error={network.error}>
            {network.data && (
              <div className="supply-map">
                <p className="supply-total">
                  <strong>{compactAda(network.data.supply.max)}</strong> maximum supply
                </p>
                <ul
                  className="supply-tiles"
                  aria-label={`${nativeTicker()} supply by where it sits`}
                >
                  {supply.map((item, index) => (
                    <li
                      key={item.label}
                      style={{
                        flexGrow: Math.max(1, share(item.value)),
                        ["--c" as string]: `var(--viz-${index + 1})`,
                      }}
                    >
                      <span>{item.label}</span>
                      <strong title={item.value.toString()}>{item.display}</strong>
                      <small>{share(item.value).toFixed(1)}%</small>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </QueryState>
        </Panel>
      </div>
    </section>
  );
}
