import { act } from "react";
import { createRoot } from "react-dom/client";
import { expect, it, vi } from "vitest";
import { MarketLoading } from "./assets";
it("announces the error without placing the retry control inside the alert", async () => {
  (
    globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
  ).IS_REACT_ACT_ENVIRONMENT = true;
  const host = document.createElement("div"),
    root = createRoot(host),
    retry = vi.fn();
  try {
    await act(async () =>
      root.render(
        <MarketLoading error={new Error("Dingo unavailable")} retry={retry} />,
      ),
    );
    expect(host.querySelector('[role="alert"]')?.textContent).toContain(
      "Dingo unavailable",
    );
    expect(host.querySelector('[role="alert"] button')).toBeNull();
    await act(async () => host.querySelector("button")!.click());
    expect(retry).toHaveBeenCalledTimes(1);
    await act(async () => root.render(<MarketLoading retry={retry} />));
    expect(host.querySelector('[role="status"]')?.textContent).toContain(
      "Reading the market",
    );
  } finally {
    await act(async () => root.unmount());
  }
});
