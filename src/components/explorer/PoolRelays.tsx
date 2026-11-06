import { useQuery } from "@tanstack/react-query";
import { blockfrostFetch } from "../../lib/dingo/blockfrost";
import { Panel } from "./Panel";
import { QueryState } from "./QueryState";
import { CopyButton } from "./CopyButton";
import "./pool-relays.css";

export interface PoolRelay {
  ipv4: string | null;
  ipv6: string | null;
  dns: string | null;
  dns_srv: string | null;
  port: number | null;
}
export function PoolRelays({ poolId }: { poolId: string }) {
  const query = useQuery({
    queryKey: ["dingo", "pool", poolId, "relays"],
    queryFn: ({ signal }) =>
      blockfrostFetch<PoolRelay[]>(`/api/v0/pools/${poolId}/relays`, {
        signal,
      }),
    staleTime: 300000,
  });
  return (
    <Panel title="Registered relays">
      <QueryState
        hasData={query.data !== undefined}
        isLoading={query.isLoading}
        error={query.error}
      >
        {query.data &&
          (query.data.length ? (
            <div className="pool-relay-grid">
              {query.data.map((relay, index) => (
                <article className="pool-relay" key={[relay.ipv4, relay.ipv6, relay.dns, relay.dns_srv, relay.port].join("|")}>
                  <header>
                    <span aria-hidden="true">◎</span>
                    <strong>Relay {index + 1}</strong>
                    <small>
                      {relay.dns_srv
                        ? "DNS SRV"
                        : relay.dns
                          ? "DNS"
                          : "IP address"}
                    </small>
                  </header>
                  {(
                    [
                      ["IPv4", relay.ipv4],
                      ["IPv6", relay.ipv6],
                      ["DNS", relay.dns],
                      ["DNS SRV", relay.dns_srv],
                    ] as const
                  )
                    .filter(([, value]) => value)
                    .map(([label, value]) => {
                      const address =
                        label === "DNS SRV" || relay.port == null
                          ? value!
                          : `${label === "IPv6" ? `[${value}]` : value}:${relay.port}`;
                      return (
                        <div className="pool-relay-address" key={label}>
                          <span>{label}</span>
                          <code>{address}</code>
                          <CopyButton value={address} label="relay address" />
                        </div>
                      );
                    })}
                  {relay.dns_srv && (
                    <p>
                      Host addresses and ports are published through this SRV
                      record.
                    </p>
                  )}
                </article>
              ))}
            </div>
          ) : (
            <p className="tool-help">This pool has no registered relays.</p>
          ))}
        <p className="pool-relay-note">
          Addresses from the pool’s latest registration, read through Dingo.
          Registration does not establish reachability.
        </p>
      </QueryState>
    </Panel>
  );
}
