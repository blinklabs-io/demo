import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { KernelCreate } from "./KernelCreate";
vi.mock("./kernelQuery", () => ({
  useKernelSelection: () => ({ record: undefined }),
}));
vi.mock("./MarketTransaction", () => ({
  MarketTransaction: ({ ready }: { ready: boolean }) => (
    <button data-review disabled={!ready}>
      Review transaction
    </button>
  ),
}));
vi.mock("../explorer/ChainMark", () => ({ ChainMark: () => null }));
let root: Root, host: HTMLDivElement;
beforeEach(() => {
  (
    globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
  ).IS_REACT_ACT_ENVIRONMENT = true;
  host = document.createElement("div");
  root = createRoot(host);
});
afterEach(async () => {
  await act(async () => root.unmount());
});
async function render(family: "lending" | "options") {
  await act(async () =>
    root.render(
      <KernelCreate
        family={family}
        tracking={{ hash: "", submitted: () => {} }}
      />,
    ),
  );
}
async function input(label: string, value: string) {
  const field = [...host.querySelectorAll("label")]
    .find((l) => l.textContent?.trim().startsWith(label))
    ?.querySelector("input");
  if (!field) throw new Error(`Missing ${label}`);
  await act(async () => {
    Object.getOwnPropertyDescriptor(
      HTMLInputElement.prototype,
      "value",
    )!.set!.call(field, value);
    field.dispatchEvent(new Event("input", { bubbles: true }));
  });
}
function disabled() {
  return host.querySelector<HTMLButtonElement>("button[data-review]")!.disabled;
}
it("keeps a parsed zero principal or fractional loan term out of review using shared creation validation", async () => {
  await render("lending");
  await input("Collateral asset", "33".repeat(28) + "01");
  expect(disabled()).toBe(false);
  await input("Principal (ADA)", "0");
  expect(disabled()).toBe(true);
  expect(host.textContent).toContain("Amounts must be positive");
  await input("Principal (ADA)", "10");
  await input("Loan term (days)", "1.5");
  expect(disabled()).toBe(true);
  await input("Loan term (days)", "30");
  expect(disabled()).toBe(false);
});
it("rejects a syntactically valid option with identical offered and exercise assets", async () => {
  await render("options");
  await input("Exercise payment asset", "33".repeat(28) + "01");
  expect(disabled()).toBe(false);
  await input("Offered asset", "33".repeat(28) + "01");
  expect(disabled()).toBe(true);
  expect(host.textContent).toContain("Offer and exercise assets must differ");
});
