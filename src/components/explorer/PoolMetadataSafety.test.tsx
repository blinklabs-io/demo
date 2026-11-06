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
    expect(request).toHaveBeenCalledTimes(1);
    expect(String(request.mock.calls[0][0])).toMatch(/^\/pool-image\?/);
    expect(host.textContent).toContain("Test pool");
    expect(host.textContent).toContain("http://127.0.0.1/private");
  } finally {
    await act(async () => root.unmount());
    client.clear();
    host.remove();
    request.mockRestore();
  }
});

it("loads and retries pool icons only through the same-origin proxy, retaining initials on failure", async () => {
  const request = vi
    .spyOn(globalThis, "fetch")
    .mockImplementation(async (input) => {
      const offset = new URL(
        String(input),
        "https://demo.pages.dev",
      ).searchParams.get("offset");
      return new Response(new Uint8Array([137, 80, 78, 71]), {
        headers: {
          "Content-Type": "image/png",
          ...(offset === "0" ? { "X-Pool-Image-Next": "1" } : {}),
        },
      });
    });
  const client = new QueryClient();
  const host = document.createElement("div");
  const root = createRoot(host);
  const metadata = {
    ticker: "BLINK",
    url: "https://pool.org/metadata.json",
    hash: "ab".repeat(32),
  };
  try {
    await act(async () =>
      root.render(
        <QueryClientProvider client={client}>
          <MemoryRouter>
            <PoolIdentity poolId="pool1blink" metadata={metadata} />
          </MemoryRouter>
        </QueryClientProvider>,
      ),
    );
    const img = host.querySelector(".pool-avatar img")!;
    expect(img).not.toBeNull();
    const src = new URL(img.getAttribute("src")!, "https://demo.pages.dev");
    expect(src.origin).toBe("https://demo.pages.dev");
    expect(src.pathname).toBe("/pool-image");
    expect(src.searchParams.get("url")).toBe(metadata.url);
    expect(src.searchParams.get("hash")).toBe(metadata.hash);
    expect(img.getAttribute("referrerpolicy")).toBe("no-referrer");
    await act(async () => img.dispatchEvent(new Event("error")));
    expect(request).toHaveBeenCalledTimes(2);
    const retry = host.querySelector(".pool-avatar img")!;
    expect(
      new URL(retry.getAttribute("src")!, src.origin).searchParams.get(
        "offset",
      ),
    ).toBe("1");
    await act(async () => retry.dispatchEvent(new Event("error")));
    expect(host.querySelector(".pool-avatar img")).toBeNull();
    expect(host.querySelector(".pool-avatar")?.textContent).toBe("BL");
  } finally {
    await act(async () => root.unmount());
    client.clear();
    request.mockRestore();
  }
});
