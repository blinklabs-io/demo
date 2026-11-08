import { act } from "react";
import { createRoot } from "react-dom/client";
import { expect, it, vi } from "vitest";
import { WalletConnectSummary } from "./WalletConnectSummary";
const data = vi.hoisted(() => ({ network: { id: "mainnet" }, connect: vi.fn(async () => {}) }));
vi.mock("../../lib/dingo/config", () => ({ DINGO_NETWORK: data.network, DINGO_CONFIG: {} }));
vi.mock("../../stores/walletStore", () => ({
  useWalletStore: (selector: (state: unknown) => unknown) => selector({
    status: "disconnected", walletName: null, changeAddress: null, error: null,
    listAvailableWallets: () => [{ name: "Example wallet", icon: "" }],
    connect: data.connect, disconnect: vi.fn(),
  }),
}));
it.each(["mainnet", "preview", "preprod", "musashi", "dijkstra", "prime-testnet"])(
  "informs the user before connecting on %s", async (network) => {
    data.network.id = network; data.connect.mockClear();
    const host = document.createElement("div");document.body.append(host);
    const root = createRoot(host);
    try {
      await act(async () => root.render(<WalletConnectSummary />));
      await act(async () => host.querySelector("button")!.click());
      const notice = host.querySelector('[role="note"]');
      const wallet = [...host.querySelectorAll("button")].find((b) => b.textContent === "Example wallet")!;
      expect(data.connect).not.toHaveBeenCalled();
      if (network === "mainnet") {
        expect(notice?.textContent).toContain("Mainnet uses real ADA and tokens");
        expect(notice?.textContent).toContain("loss of funds");
        expect(notice?.textContent).toContain("not endorsements");
        expect(notice?.textContent).toContain("does not provide financial advice");
        expect(wallet.getAttribute("aria-describedby")).toBe(notice?.id);
      } else {
        expect(notice).toBeNull();
        expect(wallet.hasAttribute("aria-describedby")).toBe(false);
      }
      await act(async () => wallet.click());
      expect(data.connect).toHaveBeenCalledWith("Example wallet");
    } finally { await act(async () => root.unmount());host.remove(); }
  },
);
