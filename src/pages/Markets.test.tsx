import { act, useState } from "react";
import { createRoot } from "react-dom/client";
import { createMemoryRouter, RouterProvider } from "react-router";
import { beforeEach, expect, it, vi } from "vitest";
import Markets from "./Markets";
import type { MarketTracking } from "../components/markets/MarketTransaction";
const network = vi.hoisted(() => ({ id: "preprod" }));
vi.mock("../lib/dingo/config", () => ({ DINGO_NETWORK: network }));
beforeEach(() => { network.id = "preprod"; });
vi.mock("../components/markets/GravityMarket", () => ({
  GravityMarket: () => <p>Gravity monitor</p>,
}));
vi.mock("../components/markets/KernelMarket", () => ({
  KernelMarket: () => null,
}));
vi.mock("../components/markets/MarketTransaction", () => ({
  MarketConfirmation: ({ tracking }: { tracking: MarketTracking }) =>
    tracking.hash ? <p>Tracking accepted {tracking.hash}</p> : null,
}));
vi.mock("../components/markets/MinswapMarket", () => ({
  MinswapMarket: ({ tracking }: { tracking?: MarketTracking }) => {
    const [hash, setHash] = useState("");
    const state = tracking ?? { hash, submitted: setHash };
    return (
      <>
        <button onClick={() => state.submitted("ab".repeat(32))}>
          Submit fixture order
        </button>
        <p>Order {state.hash}</p>
      </>
    );
  },
}));
it("keeps accepted Minswap tracking through switching to Gravity and back", async () => {
  (
    globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
  ).IS_REACT_ACT_ENVIRONMENT = true;
  const host = document.createElement("div"),
    root = createRoot(host),
    router = createMemoryRouter(
      [{ path: "/wallet/markets/:tab", element: <Markets /> }],
      { initialEntries: ["/wallet/markets/liquidity"] },
    );
  async function click(text: string) {
    const button = [...host.querySelectorAll("button")].find(
      (button) => button.textContent === text,
    );
    if (!button) throw new Error(`Missing ${text}`);
    await act(async () => button.click());
  }
  try {
    await act(async () => root.render(<RouterProvider router={router} />));
    await click("Submit fixture order");
    expect(host.textContent).toContain("Tracking accepted " + "ab".repeat(32));
    await click("Gravity · pool monitor");
    expect(host.textContent).toContain("Gravity monitor");
    expect(host.textContent).toContain("Tracking accepted " + "ab".repeat(32));
    await click("Minswap · liquidity & orders");
    expect(host.textContent).toContain("Order " + "ab".repeat(32));
  } finally {
    await act(async () => root.unmount());
    router.dispose();
  }
});

it.each(["liquidity", "lending", "options", "orders", "marketplace"])("routes mainnet %s to its supported workspace", async (tab) => {
  network.id = "mainnet";
  const host = document.createElement("div"), root = createRoot(host);
  const router = createMemoryRouter([{ path: "/wallet/markets/:tab", element: <Markets /> }], { initialEntries: [`/wallet/markets/${tab}`] });
  try {
    await act(async () => root.render(<RouterProvider router={router} />));
    expect(host.textContent).toContain(tab === "liquidity" ? "Submit fixture order" : "Apps on the live chain.");
    expect(host.textContent).not.toContain("Open Preprod markets");
  } finally { await act(async () => root.unmount()); router.dispose(); }
});
