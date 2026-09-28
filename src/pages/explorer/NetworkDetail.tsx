import { useQuery } from "@tanstack/react-query";
import { Panel, Field } from "../../components/explorer/Panel";
import { QueryState } from "../../components/explorer/QueryState";
import { blockfrostFetch } from "../../lib/dingo/blockfrost";
import { formatAda } from "../../lib/format";

interface NetworkResponse {
  supply: { max: string; total: string; circulating: string; locked: string; treasury: string; reserves: string };
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
  return `${formatAda(BigInt(value))} ADA`;
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
    queryFn: () => blockfrostFetch<NetworkEraResponse[]>("/api/v0/network/eras"),
    staleTime: Infinity,
  });

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="text-xl font-semibold text-white">Network</h1>
        <p className="mt-1 text-sm text-slate-400">Supply, stake, genesis settings, and era timing reported by Dingo.</p>
      </div>

      <Panel title="Supply and stake">
        <QueryState isLoading={networkQuery.isLoading} error={networkQuery.error}>
          {networkQuery.data && (
            <div>
              <Field label="Maximum supply" value={ada(networkQuery.data.supply.max)} />
              <Field label="Total supply" value={ada(networkQuery.data.supply.total)} />
              <Field label="Circulating supply" value={ada(networkQuery.data.supply.circulating)} />
              <Field label="Locked supply" value={ada(networkQuery.data.supply.locked)} />
              <Field label="Treasury" value={ada(networkQuery.data.supply.treasury)} />
              <Field label="Reserves" value={ada(networkQuery.data.supply.reserves)} />
              <Field label="Live stake" value={ada(networkQuery.data.stake.live)} />
              <Field label="Active stake" value={ada(networkQuery.data.stake.active)} />
            </div>
          )}
        </QueryState>
      </Panel>

      <Panel title="Genesis settings">
        <QueryState isLoading={genesisQuery.isLoading} error={genesisQuery.error}>
          {genesisQuery.data && (
            <div>
              <Field label="Network magic" value={genesisQuery.data.network_magic} />
              <Field label="System start" value={date(genesisQuery.data.system_start)} />
              <Field label="Maximum lovelace supply" value={ada(genesisQuery.data.max_lovelace_supply)} />
              <Field label="Epoch length" value={`${genesisQuery.data.epoch_length.toLocaleString()} slots`} />
              <Field label="Slot length" value={`${genesisQuery.data.slot_length} seconds`} />
              <Field label="Active slots coefficient" value={genesisQuery.data.active_slots_coefficient} />
              <Field label="Security parameter" value={genesisQuery.data.security_param} />
              <Field label="KES period" value={`${genesisQuery.data.slots_per_kes_period.toLocaleString()} slots`} />
              <Field label="Maximum KES evolutions" value={genesisQuery.data.max_kes_evolutions} />
              <Field label="Update quorum" value={genesisQuery.data.update_quorum} />
            </div>
          )}
        </QueryState>
      </Panel>

      <Panel title="Era timeline">
        <QueryState isLoading={erasQuery.isLoading} error={erasQuery.error}>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[44rem] text-left text-sm">
              <thead><tr className="text-xs uppercase tracking-wide text-slate-500"><th className="pb-2">Era</th><th className="pb-2">Start</th><th className="pb-2">End</th><th className="pb-2">Epoch length</th><th className="pb-2">Slot length</th><th className="pb-2">Safe zone</th></tr></thead>
              <tbody>
                {erasQuery.data?.map((era, index) => (
                  <tr key={`${era.start.slot}:${index}`} className="border-t border-slate-800">
                    <td className="py-2 text-slate-200">{index === erasQuery.data.length - 1 ? "Current era" : `Era boundary ${index + 1}`}</td>
                    <td className="py-2 text-slate-400">{date(era.start.time)}<br />slot {era.start.slot.toLocaleString()} · epoch {era.start.epoch}</td>
                    <td className="py-2 text-slate-400">{era.end ? <>{date(era.end.time)}<br />slot {era.end.slot.toLocaleString()} · epoch {era.end.epoch}</> : "Ongoing"}</td>
                    <td className="py-2 text-slate-400">{era.parameters.epoch_length.toLocaleString()}</td>
                    <td className="py-2 text-slate-400">{era.parameters.slot_length}s</td>
                    <td className="py-2 text-slate-400">{era.parameters.safe_zone.toLocaleString()} slots</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </QueryState>
      </Panel>
    </div>
  );
}
