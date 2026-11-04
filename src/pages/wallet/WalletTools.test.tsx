import { act, useState } from "react";
import { createRoot, type Root } from "react-dom/client";
import { MemoryRouter, Route, Routes } from "react-router";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { ToolAction } from "../../lib/tools/transactions";
import WalletTools from "./WalletTools";
import { useWalletStore } from "../../stores/walletStore";

const boundary = vi.hoisted(() => ({
  finalizers: [] as (() => void)[],
  posts: 0,
}));
vi.mock("../../components/wallet/ToolTransaction", () => ({
  ToolTransaction: ({
    action,
    assertDraft,
  }: {
    action: () => ToolAction;
    assertDraft?: () => void;
  }) => {
    const [draft, setDraft] = useState<ToolAction | null>(null);
    return draft ? (
      <section aria-label="Fixture reviewed transaction">
        <p>{JSON.stringify(draft)}</p>
        <button
          onClick={() =>
            boundary.finalizers.push(() => {
              assertDraft?.();
              boundary.posts++;
            })
          }
        >
          Approve in fixture wallet
        </button>
      </section>
    ) : (
      <button
        onClick={() => {
          assertDraft?.();
          setDraft(action());
        }}
      >
        Build fixture draft
      </button>
    );
  },
}));
let root: Root, container: HTMLDivElement;
beforeEach(async () => {
  (
    globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
  ).IS_REACT_ACT_ENVIRONMENT = true;
  boundary.finalizers = [];
  boundary.posts = 0;
  useWalletStore.setState({
    status: "disconnected",
    walletApi: null,
    connectionId: 1,
  });
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  await act(async () => {
    root.render(
      <MemoryRouter initialEntries={["/wallet/tools/treasury"]}>
        <Routes>
          <Route path="/wallet/tools/:tool" element={<WalletTools />} />
        </Routes>
      </MemoryRouter>,
    );
  });
});
afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
});
async function click(label: string) {
  const button = [...container.querySelectorAll("button")].find(
    (node) => node.textContent === label,
  );
  expect(button).toBeDefined();
  await act(async () => button!.click());
}
async function amount(value: string) {
  const input = container.querySelector<HTMLInputElement>(".tool-form input")!;
  await act(async () => {
    Object.getOwnPropertyDescriptor(
      HTMLInputElement.prototype,
      "value",
    )!.set!.call(input, value);
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
}
it("invalidates a reviewed transaction when the actual controlled tool form changes", async () => {
  await click("Build fixture draft");
  expect(
    container.querySelector('[aria-label="Fixture reviewed transaction"]'),
  ).not.toBeNull();
  await amount("20");
  expect(
    container.querySelector('[aria-label="Fixture reviewed transaction"]'),
  ).toBeNull();
});
it("does not resurrect an earlier wallet approval after A to B to A edits", async () => {
  await click("Build fixture draft");
  await click("Approve in fixture wallet");
  const finishOldApproval = boundary.finalizers[0];
  await amount("20");
  await amount("10");
  expect(() => finishOldApproval()).toThrow("Draft details changed");
  expect(boundary.posts).toBe(0);
  await click("Build fixture draft");
  await click("Approve in fixture wallet");
  boundary.finalizers[1]();
  expect(boundary.posts).toBe(1);
});
it("cancels a captured approval after leaving the tool", async () => {
  await click("Build fixture draft");
  await click("Approve in fixture wallet");
  const finishOldApproval = boundary.finalizers[0];
  await act(async () => root.render(<p>Another page</p>));
  expect(() => finishOldApproval()).toThrow("Draft details changed");
  expect(boundary.posts).toBe(0);
});
it("cancels a captured approval after the wallet connection changes", async () => {
  await click("Build fixture draft");
  await click("Approve in fixture wallet");
  const finishOldApproval = boundary.finalizers[0];
  await act(async () => {
    useWalletStore.setState({ connectionId: 2 });
  });
  expect(() => finishOldApproval()).toThrow("Draft details changed");
  expect(boundary.posts).toBe(0);
});
