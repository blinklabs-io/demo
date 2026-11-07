// @vitest-environment node
import { createRequire } from "node:module";
const { JSDOM } = createRequire(import.meta.url)("jsdom");
import { afterAll, expect, it, vi } from "vitest";
const dom = new JSDOM("<!doctype html><html><body></body></html>", {
  url: "http://localhost",
});
Object.assign(globalThis, {
  window: dom.window,
  document: dom.window.document,
  Event: dom.window.Event,
  HTMLTextAreaElement: dom.window.HTMLTextAreaElement,
});
const { act } = await import("react");
const { createRoot } = await import("react-dom/client");
const { MemoryRouter } = await import("react-router");
const { QueryClient, QueryClientProvider, notifyManager } =
  await import("@tanstack/react-query");
const { default: PlutusWorkbench } = await import("./PlutusWorkbench");
notifyManager.setScheduler(queueMicrotask);
afterAll(() => dom.window.close());

it("decodes the example, copies structured data and switches developer examples without a wallet", async () => {
  const copy = vi.fn(async (value: string) => {
    void value;
  });
  Object.defineProperty(window, "isSecureContext", {
    value: true,
    configurable: true,
  });
  Object.defineProperty(navigator, "clipboard", {
    value: { writeText: copy },
    configurable: true,
  });
  const host = document.createElement("div");
  const root = createRoot(host);
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  await act(async () =>
    root.render(
      <QueryClientProvider client={client}>
        <MemoryRouter>
          <PlutusWorkbench />
        </MemoryRouter>
      </QueryClientProvider>,
    ),
  );
  const button = (text: string) =>
    [...host.querySelectorAll("button")].find((b) => b.textContent === text)!;
  try {
    await act(async () => button("Load example").click());
    expect(
      host.querySelector('[aria-label="Decoded Plutus data"]')?.textContent,
    ).toContain('"int": "42"');
    await act(async () =>
      (
        host.querySelector(
          '[aria-label="Copy full decoded Plutus JSON"]',
        ) as HTMLButtonElement
      ).click(),
    );
    expect(copy).toHaveBeenCalledWith(
      JSON.stringify(
        { constructor: "0", fields: [{ int: "42" }, { bytes: "68656c6c6f" }] },
        null,
        2,
      ),
    );
    const guide = host.querySelector(
      "details.build-this",
    )! as HTMLDetailsElement;
    await act(async () => {
      guide.open = true;
      guide.dispatchEvent(new Event("toggle"));
    });
    const language = host.querySelector("select")!;
    await act(async () => {
      language.value = "cURL";
      language.dispatchEvent(new Event("change", { bubbles: true }));
    });
    await act(async () =>
      (
        host.querySelector(
          '[aria-label="Copy full developer example"]',
        ) as HTMLButtonElement
      ).click(),
    );
    expect(copy.mock.calls.at(-1)?.[0]).toContain("curl --fail-with-body");
    expect(copy.mock.calls.at(-1)?.[0]).toContain(
      "/api/v0/txs/TRANSACTION_ID/cbor",
    );
    await act(async () => {
      language.value = "SDK";
      language.dispatchEvent(new Event("change", { bubbles: true }));
    });
    await act(async () =>
      (
        host.querySelector(
          '[aria-label="Copy full developer example"]',
        ) as HTMLButtonElement
      ).click(),
    );
    expect(copy.mock.calls.at(-1)?.[0]).toContain("Core.PlutusData.fromCbor");
    const input = host.querySelector("textarea")!;
    await act(async () => {
      Object.getOwnPropertyDescriptor(
        HTMLTextAreaElement.prototype,
        "value",
      )!.set!.call(input, "0001");
      input.dispatchEvent(new Event("input", { bubbles: true }));
    });
    await act(async () =>
      input
        .closest("form")!
        .dispatchEvent(
          new Event("submit", { bubbles: true, cancelable: true }),
        ),
    );
    expect(host.querySelector('[role="alert"]')?.textContent).toContain(
      "Unexpected bytes",
    );
  } finally {
    await act(async () => root.unmount());
    client.clear();
    host.remove();
  }
});

it("keeps transaction data when input resolution fails and clears selected context after rollback", async () => {
  const { Core } = await import("@blaze-cardano/sdk");
  const cbor = "84a3008001800200a10581840000182a820102f5f6";
  const hash = String(Core.Transaction.fromCbor(Core.TxCBOR(cbor)).getId());
  let rolledBack = false;
  vi.mocked(globalThis.fetch).mockImplementation(async (url) => {
    if (!rolledBack && String(url).endsWith("/cbor"))
      return new Response(JSON.stringify({ cbor }), { status: 200 });
    return new Response(
      JSON.stringify({ message: "Input context unavailable" }),
      { status: rolledBack ? 404 : 503 },
    );
  });
  const host = document.createElement("div"),
    root = createRoot(host);
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  await act(async () =>
    root.render(
      <QueryClientProvider client={client}>
        <MemoryRouter
          initialEntries={[
            {
              pathname: "/wallet/tools/data",
              state: { transactionHash: hash },
            },
          ]}
        >
          <PlutusWorkbench />
        </MemoryRouter>
      </QueryClientProvider>,
    ),
  );
  try {
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    expect(host.textContent).toContain("Input context unavailable");
    const choice = [...host.querySelectorAll("button")].find(
      (button) => button.textContent === "Spend redeemer #0",
    )!;
    await act(async () => choice.click());
    expect(
      host.querySelector('[aria-label="Decoded Plutus data"]')?.textContent,
    ).toContain('"int": "42"');
    expect(
      [...host.querySelectorAll("h2")].some(
        (h) => h.textContent === "Spend redeemer #0",
      ),
    ).toBe(true);
    rolledBack = true;
    await act(async () => {
      await client.resetQueries({ queryKey: ["dingo", "tx", hash] });
    });
    expect(
      [...host.querySelectorAll("h2")].some(
        (h) => h.textContent === "Spend redeemer #0",
      ),
    ).toBe(false);
    expect(host.querySelector('[aria-label="Decoded Plutus data"]')).toBeNull();
  } finally {
    await act(async () => root.unmount());
    client.clear();
  }
});
