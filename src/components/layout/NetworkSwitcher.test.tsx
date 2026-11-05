import { act } from "react";
import { createRoot } from "react-dom/client";
import { expect, it, vi } from "vitest";
import { changeDingoNetwork } from "../../lib/dingo/networkSelection";
import { NetworkSwitcher } from "./NetworkSwitcher";
vi.mock("../../lib/dingo/networkSelection", () => ({ changeDingoNetwork: vi.fn() }));

it("allows retry after a failed switch and locks the selector while navigation starts", async () => {
  const container = document.createElement("div");
  const root = createRoot(container);
  const switchNetwork = vi.mocked(changeDingoNetwork);
  switchNetwork.mockImplementationOnce(() => { throw new Error("Navigation unavailable"); });
  try {
    await act(async () => root.render(<NetworkSwitcher />));
    const select = container.querySelector("select")!;
    await act(async () => { select.value = "preprod"; select.dispatchEvent(new Event("change", { bubbles: true })); });
    expect(container.querySelector('[role="alert"]')?.textContent).toContain("Navigation unavailable");
    expect(select.disabled).toBe(false);
    expect(switchNetwork).toHaveBeenCalledWith("preprod");
    await act(async () => { select.value = "preprod"; select.dispatchEvent(new Event("change", { bubbles: true })); });
    expect(select.disabled).toBe(true);
    expect(container.querySelector('[role="alert"]')).toBeNull();
    expect(container.querySelector('[role="status"]')?.textContent).toContain("Switching networks");
  } finally { await act(async () => root.unmount()); }
});
