import { act } from "react";
import { createRoot } from "react-dom/client";
import { createMemoryRouter, RouterProvider } from "react-router";
import { expect, it, vi } from "vitest";
import WalletSwap from "./WalletSwap";
vi.mock("../../lib/dingo/config", () => ({ DINGO_NETWORK: { id: "mainnet", label: "Mainnet", networkMagic: 764824073 }, DINGO_CONFIG: { blockfrostUrl: "http://localhost", utxorpcUrl: "http://localhost", meshUrl: "http://localhost" } }));
vi.mock("../../components/markets/MinswapMarket", () => ({ MinswapMarket: () => <p>Minswap workspace</p> }));
vi.mock("../../components/markets/WingRidersMarket", () => ({ WingRidersMarket: ({ onBusy }: { onBusy: (busy: boolean) => void }) => <><p>WingRiders workspace</p><button onClick={() => onBusy(true)}>Begin submission</button><button onClick={() => onBusy(false)}>Finish submission</button></> }));
it("synchronizes venue links, navigation, and the submission lock", async () => {
  const host = document.createElement("div"), root = createRoot(host);
  const router = createMemoryRouter([{ path: "/wallet/swap", element: <WalletSwap /> }], { initialEntries: ["/wallet/swap?network=mainnet"] });
  const button = (label: string) => [...host.querySelectorAll("button")].find((x) => x.textContent === label)!;
  try {
    await act(async () => root.render(<RouterProvider router={router} />));
    expect(host.textContent).toContain("Minswap workspace");
    await act(async () => button("WingRiders").click());
    expect(router.state.location.search).toContain("venue=wingriders");
    expect(router.state.location.search).toContain("network=mainnet");
    expect(host.textContent).toContain("WingRiders workspace");
    await act(async () => button("Begin submission").click());
    expect(button("Minswap").disabled).toBe(true);
    await act(async () => button("Minswap").click());
    expect(host.textContent).toContain("WingRiders workspace");
    await act(async () => button("Finish submission").click());
    expect(button("Minswap").disabled).toBe(false);
    await act(async () => router.navigate("/wallet/swap?network=mainnet&venue=minswap"));
    expect(host.textContent).toContain("Minswap workspace");
    await act(async () => router.navigate(-1));
    expect(host.textContent).toContain("WingRiders workspace");
  } finally { await act(async () => root.unmount()); router.dispose(); }
});
