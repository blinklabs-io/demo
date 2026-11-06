import { act } from "react";
import { createRoot } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router";
import { expect, it, vi } from "vitest";
import { PoolIdentity } from "./PoolIdentity";
import { PoolMetadataPanel } from "./PoolMetadataPanel";

it("does not request pool-controlled metadata or image URLs", async () => {
  const request = vi
    .spyOn(globalThis, "fetch")
    .mockImplementation(() => new Promise(() => {}));
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  const metadata = {
    ticker: "TEST",
    name: "Test pool",
    description: "Owner metadata",
    homepage: "https://example.com",
    url: "http://127.0.0.1/private",
    hash: "ab".repeat(32),
  };
  const host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  try {
    await act(async () =>
      root.render(
        <QueryClientProvider client={client}>
          <MemoryRouter>
            <PoolIdentity poolId="pool1test" metadata={metadata} />
            <PoolMetadataPanel
              metadata={metadata}
              isLoading={false}
              error={null}
            />
          </MemoryRouter>
        </QueryClientProvider>,
      ),
    );
    expect(request).not.toHaveBeenCalled();
    expect(host.textContent).toContain("Test pool");
    expect(host.textContent).toContain("http://127.0.0.1/private");
  } finally {
    await act(async () => root.unmount());
    client.clear();
    host.remove();
    request.mockRestore();
  }
});
