import { act } from "react";
import { createRoot } from "react-dom/client";
import { createMemoryRouter, RouterProvider } from "react-router";
import { expect, it, vi } from "vitest";
import { AppShell } from "./AppShell";
import { reloadDingoPage } from "../../lib/dingo/networkSelection";
vi.mock("../../lib/dingo/config", () => ({ DINGO_NETWORK: { id: "preview" } }));
vi.mock("../../lib/dingo/networkSelection", () => ({
  reloadDingoPage: vi.fn(),
}));
vi.mock("../../lib/chain/useChainReconciliation", () => ({
  useChainReconciliation: () => undefined,
}));
vi.mock("./Header", () => ({ Header: () => <div /> }));
vi.mock("../../stores/mempoolStore", () => ({
  useMempoolStore: (select: (state: { start: () => void }) => unknown) =>
    select({ start: () => undefined }),
}));
vi.mock("../../stores/tipStore", () => ({
  useTipStore: (select: (state: { start: () => void }) => unknown) =>
    select({ start: () => undefined }),
}));

async function shell(path: string) {
  window.scrollTo = vi.fn();
  const host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  const router = createMemoryRouter([{ path: "*", element: <AppShell /> }], {
    initialEntries: [path],
  });
  await act(async () => root.render(<RouterProvider router={router} />));
  function link(label: string) {
    const found = [...host.querySelectorAll("a")].find(
      (node) => node.textContent === label,
    );
    if (!found) throw new Error("Missing contextual link " + label);
    return found;
  }
  return {
    router,
    link,
    close: async () => {
      await act(async () => root.unmount());
      router.dispose();
      host.remove();
    },
  };
}

it("keeps market navigation on Preview until the user explicitly switches networks", async () => {
  const page = await shell("/wallet/swap?network=preview");
  try {
    expect(page.link("Liquidity").getAttribute("href")).toBe(
      "/wallet/markets/liquidity?network=preview",
    );
    await act(async () => page.link("Liquidity").click());
    expect(page.router.state.location.pathname).toBe(
      "/wallet/markets/liquidity",
    );
    expect(page.router.state.location.search).toBe("?network=preview");
    expect(reloadDingoPage).not.toHaveBeenCalled();
  } finally {
    await page.close();
  }
});

it("marks the default lending page current without claiming pool-detail ancestors are current pages", async () => {
  const page = await shell("/wallet/markets?network=preview");
  try {
    expect(page.link("Lending").getAttribute("aria-current")).toBe("page");
    await act(async () =>
      page.router.navigate("/explorer/pool/pool1example?network=preview"),
    );
    expect(page.link("Stake pools").className).toContain("selected");
    expect(page.link("Stake pools").getAttribute("aria-current")).toBeNull();
  } finally {
    await page.close();
  }
});
