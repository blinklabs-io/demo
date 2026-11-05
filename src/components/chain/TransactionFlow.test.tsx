// @vitest-environment node
import { createRequire } from "node:module";
const { JSDOM } = createRequire(import.meta.url)("jsdom");
import { act } from "react";
import { createRoot } from "react-dom/client";
import { MemoryRouter } from "react-router";
import { afterAll, beforeAll, expect, it } from "vitest";
import { Core } from "@blaze-cardano/sdk";
import { TransactionFlow } from "./TransactionFlow";
const dom = new JSDOM("<!doctype html><html><body></body></html>", {
  url: "http://localhost",
});
beforeAll(async () => {
  Object.assign(globalThis, {
    window: dom.window,
    document: dom.window.document,
    MouseEvent: dom.window.MouseEvent,
    KeyboardEvent: dom.window.KeyboardEvent,
  });
  await Core.initCrypto();
});
afterAll(() => {
  dom.window.close();
});
const address = (n: string) =>
  Core.addressFromCredential(
    0,
    Core.Credential.fromCore({
      type: Core.CredentialType.KeyHash,
      hash: Core.Hash28ByteBase16(n.repeat(28)),
    }),
  ).toBech32();
function fixture() {
  const tx = new Core.Transaction(
    new Core.TransactionBody(
      Core.CborSet.fromCore([], Core.TransactionInput.fromCore),
      [],
      1000000n,
    ),
    new Core.TransactionWitnessSet(),
  );
  return {
    summary: {
      hash: tx.getId(),
      fees: "1000000",
      deposit: "0",
      treasury_donation: "0",
      valid_contract: true,
    },
    cbor: tx.toCbor(),
  };
}
async function render(props: Parameters<typeof TransactionFlow>[0]) {
  const host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  await act(async () =>
    root.render(
      <MemoryRouter>
        <TransactionFlow {...props} />
      </MemoryRouter>,
    ),
  );
  return {
    host,
    close: async () => {
      await act(async () => root.unmount());
      host.remove();
    },
  };
}
const row = (addr: string, quantity: string, index = 0) => ({
  address: addr,
  output_index: index,
  collateral: false,
  amount: [{ unit: "lovelace", quantity }],
});
it("groups exact addresses by side and inspects complete identity without losing the address link", async () => {
  const a = address("11"),
    b = address("22");
  const view = await render({
    ...fixture(),
    inputs: [row(a, "9000000"), row(a, "6000000", 1)],
    outputs: [row(b, "14000000")],
  });
  try {
    expect(
      view.host.querySelectorAll('.river-svg [role="button"]'),
    ).toHaveLength(3);
    const source = view.host.querySelector('.river-svg [role="button"]')!;
    await act(async () =>
      source.dispatchEvent(
        new KeyboardEvent("keydown", { key: "Enter", bubbles: true }),
      ),
    );
    const panel = view.host.querySelector(
      '[aria-label="Selected flow branch"]',
    )!;
    expect(panel.textContent).toContain("2 value entries");
    expect(panel.textContent).toContain(a);
    expect(panel.textContent).toContain("15.00 ADA");
    expect(panel.querySelector("a")?.getAttribute("href")).toContain(
      `/explorer/address/${a}`,
    );
    const check = view.host.querySelector('input[type="checkbox"]')!;
    await act(async () =>
      check.dispatchEvent(new MouseEvent("click", { bubbles: true })),
    );
    expect(
      view.host.querySelectorAll('.river-svg [role="button"]'),
    ).toHaveLength(4);
    expect(
      view.host.querySelector('[aria-label="Selected flow branch"]'),
    ).toBeNull();
  } finally {
    await view.close();
  }
});
it("expands every branch instead of dropping small destinations", async () => {
  const view = await render({
    ...fixture(),
    inputs: [row(address("11"), "7000000")],
    outputs: Array.from({ length: 6 }, (_, i) =>
      row(address(String(i + 2).padStart(2, "0")), "1000000", i),
    ),
  });
  try {
    const button = [...view.host.querySelectorAll("button")].find((b) =>
      b.textContent?.startsWith("Show all"),
    )!;
    expect(button).toBeTruthy();
    expect(
      view.host.querySelector('.river-svg [aria-label^="Show all"]'),
    ).toBeTruthy();
    await act(async () => button.click());
    expect(
      view.host.querySelector('.river-svg [aria-label^="Show all"]'),
    ).toBeNull();
    expect(
      view.host.querySelectorAll('.river-svg [role="button"]'),
    ).toHaveLength(8);
    expect(button.getAttribute("aria-expanded")).toBe("true");
  } finally {
    await view.close();
  }
});
it("keeps reference and unused collateral outside successful value flows", async () => {
  const a = address("11");
  const view = await render({
    ...fixture(),
    inputs: [
      row(a, "3000000"),
      { ...row(a, "10000000"), reference: true },
      { ...row(a, "5000000"), collateral: true },
    ],
    outputs: [row(address("22"), "2000000")],
  });
  try {
    expect(view.host.querySelector(".river-totals")?.textContent).toContain(
      "Balanced",
    );
    expect(view.host.querySelector(".river-totals")?.textContent).toContain(
      "3.00 ADA",
    );
    expect(view.host.querySelector(".river-totals")?.textContent).not.toContain(
      "18.00 ADA",
    );
  } finally {
    await view.close();
  }
});

it("removes inspection of hidden branches when returning to main branches", async () => {
  const view = await render({
    ...fixture(),
    inputs: [row(address("11"), "7000000")],
    outputs: Array.from({ length: 6 }, (_, i) =>
      row(address(String(i + 2).padStart(2, "0")), "1000000", i),
    ),
  });
  try {
    const more = view.host.querySelector(
      '.river-svg [aria-label^="Show all"]',
    )!;
    expect(more).toBeTruthy();
    expect(more.hasAttribute("aria-pressed")).toBe(false);
    await act(async () =>
      more.dispatchEvent(
        new KeyboardEvent("keydown", { key: "Enter", bubbles: true }),
      ),
    );
    const nodes = view.host.querySelectorAll('.river-svg [role="button"]');
    await act(async () =>
      nodes[nodes.length - 1].dispatchEvent(
        new MouseEvent("click", { bubbles: true }),
      ),
    );
    expect(view.host.querySelector(".flow-inspector")).toBeTruthy();
    const collapse = [...view.host.querySelectorAll("button")].find(
      (b) => b.textContent === "Show main branches",
    )!;
    await act(async () => collapse.click());
    expect(view.host.querySelector(".flow-inspector")).toBeNull();
    expect(
      [...view.host.querySelectorAll(".river-svg path")].every(
        (p) => p.getAttribute("opacity") === ".65",
      ),
    ).toBe(true);
  } finally {
    await view.close();
  }
});
