import { act } from "react";
import { createRoot } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router";
import { beforeEach, expect, it, vi } from "vitest";
import { blockfrostFetch } from "../../lib/dingo/blockfrost";
import { PoolDelegators } from "./PoolDelegators";

vi.mock("../../lib/dingo/blockfrost", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../lib/dingo/blockfrost")>()),
  blockfrostFetch: vi.fn(),
}));

const page = (start: number, n: number) =>
  Array.from({ length: n }, (_, i) => ({
    address: `stake1u${start + i}`,
    live_stake: "2000000",
  }));

beforeEach(() => vi.mocked(blockfrostFetch).mockReset());

async function mount(client: QueryClient) {
  const host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  await act(async () =>
    root.render(
      <QueryClientProvider client={client}>
        <MemoryRouter>
          <PoolDelegators poolId="pool1test" />
        </MemoryRouter>
      </QueryClientProvider>,
    ),
  );
  return { host, unmount: () => act(async () => root.unmount()) };
}

it("offers another page only after a full page and appends it on request", async () => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  client.setQueryData(["dingo", "pool", "pool1test", "delegators"], {
    pages: [page(0, 20)],
    pageParams: [1],
  });
  const { host, unmount } = await mount(client);
  try {
    const more = [...host.querySelectorAll("button")].find((b) =>
      b.textContent?.includes("Load 20 more"),
    );
    expect(more).toBeTruthy();
    expect(host.textContent).toContain("Showing 20 delegators");
    expect(blockfrostFetch).not.toHaveBeenCalled();
    vi.mocked(blockfrostFetch).mockResolvedValueOnce(page(20, 5));
    await act(async () => more!.click());
    expect(blockfrostFetch).toHaveBeenCalledExactlyOnceWith(
      "/api/v0/pools/pool1test/delegators?count=20&page=2&order=asc",
      expect.anything(),
    );
    expect(host.querySelectorAll(".pool-delegator")).toHaveLength(25);
    expect(host.textContent).toContain("Showing 25 delegators");
    expect(host.textContent).toContain("stake1u24");
    expect(
      [...host.querySelectorAll("button")].some((b) =>
        b.textContent?.includes("Load 20 more"),
      ),
    ).toBe(false);
  } finally {
    await unmount();
    client.clear();
    host.remove();
  }
});

it("shows the empty state and no load control when a pool has no delegators", async () => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  client.setQueryData(["dingo", "pool", "pool1test", "delegators"], {
    pages: [[]],
    pageParams: [1],
  });
  const { host, unmount } = await mount(client);
  try {
    expect(host.textContent).toContain("No current delegators.");
    expect(host.querySelector("button.experience-primary")).toBeNull();
    vi.restoreAllMocks();
  } finally {
    await unmount();
    client.clear();
    host.remove();
  }
});
