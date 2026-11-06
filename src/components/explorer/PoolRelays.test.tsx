import { act } from "react";
import { createRoot } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { expect, it } from "vitest";
import { PoolRelays, type PoolRelay } from "./PoolRelays";

it("shows both IP families, DNS endpoints, and SRV records without inventing ports", async () => {
  const client = new QueryClient();
  const relays: PoolRelay[] = [
    {
      ipv4: "192.0.2.7",
      ipv6: "2001:db8::7",
      dns: null,
      dns_srv: null,
      port: 3001,
    },
    { ipv4: null, ipv6: null, dns: "relay.example", dns_srv: null, port: 3002 },
    {
      ipv4: null,
      ipv6: null,
      dns: null,
      dns_srv: "_cardano._tcp.example",
      port: 0,
    },
  ];
  client.setQueryData(["dingo", "pool", "pool1test", "relays"], relays);
  const host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  try {
    await act(async () =>
      root.render(
        <QueryClientProvider client={client}>
          <PoolRelays poolId="pool1test" />
        </QueryClientProvider>,
      ),
    );
    expect(
      [...host.querySelectorAll("code")].map((c) => c.textContent),
    ).toEqual([
      "192.0.2.7:3001",
      "[2001:db8::7]:3001",
      "relay.example:3002",
      "_cardano._tcp.example",
    ]);
    expect(host.querySelectorAll("article")).toHaveLength(3);
    expect(
      host.querySelectorAll('button[aria-label="Copy full relay address"]'),
    ).toHaveLength(4);
  } finally {
    await act(async () => root.unmount());
    client.clear();
    host.remove();
  }
});
