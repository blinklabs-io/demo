import { afterEach, expect, it, vi } from "vitest";
vi.mock("./config", () => ({ DINGO_NETWORK: { id: "preview" } }));
vi.mock("../../stores/walletStore", () => ({ useWalletStore: { getState: () => ({ disconnect: () => {} }) } }));
vi.mock("../../stores/tipStore", () => ({ useTipStore: { getState: () => ({ stop: () => {} }) } }));
vi.mock("../../stores/mempoolStore", () => ({ useMempoolStore: { getState: () => ({ stop: () => {} }) } }));
afterEach(() => { vi.resetModules(); });
it("reloads only a persisted restored page that initiated a network switch", async () => {
  vi.resetModules();
  const { installNetworkRestoreGuard } = await import("./networks");
  const { changeDingoNetwork } = await import("./networkSelection");
  const realWindow = window;
  const reload = vi.fn(), assign = vi.fn();
  const callbacks = new Set<(event: { persisted: boolean }) => void>();
  vi.stubGlobal("window", {
    location: { reload, assign, pathname: "/wallet/swap", search: "?network=preview", hash: "" },
    localStorage: { setItem: vi.fn() },
    addEventListener: (_name: string, callback: (event: { persisted: boolean }) => void) => callbacks.add(callback),
    removeEventListener: (_name: string, callback: (event: { persisted: boolean }) => void) => callbacks.delete(callback),
  });
  const stop = installNetworkRestoreGuard();
  const pageShow = (persisted: boolean) => callbacks.forEach((callback) => callback({ persisted }));
  try {
    pageShow(true);
    expect(reload).not.toHaveBeenCalled();
    changeDingoNetwork("preprod");
    expect(assign).toHaveBeenCalledWith("/wallet/swap?network=preprod");
    pageShow(false);
    expect(reload).not.toHaveBeenCalled();
    pageShow(true);
    expect(reload).toHaveBeenCalledOnce();
    stop();
    pageShow(true);
    expect(reload).toHaveBeenCalledOnce();
  } finally { stop(); vi.stubGlobal("window", realWindow); vi.unstubAllGlobals(); }
});
