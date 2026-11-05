import { act } from "react";
import { Core } from "@blaze-cardano/sdk";
import { createRoot, type Root } from "react-dom/client";
import { createMemoryRouter, RouterProvider } from "react-router";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { buildPayment, readTransaction } from "../lib/transactions/studio";
import { useWalletStore } from "../stores/walletStore";
import TransactionStudio from "./TransactionStudio";
vi.mock("../lib/transactions/studio", () => ({
  readTransaction: vi.fn(),
  buildPayment: vi.fn(),
  addWalletWitness: vi.fn(),
  transactionEnvelope: vi.fn(),
  jsonValue: vi.fn(),
}));
let root: Root,
  router: ReturnType<typeof createMemoryRouter>,
  container: HTMLDivElement;
beforeEach(async () => {
  (
    globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
  ).IS_REACT_ACT_ENVIRONMENT = true;
  useWalletStore.setState({ status: "disconnected", walletApi: null });
  vi.mocked(readTransaction).mockImplementation(() => {
    throw new Error("Rejected fixture CBOR");
  });
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  router = createMemoryRouter(
    [{ path: "/studio", element: <TransactionStudio /> }],
    { initialEntries: ["/studio"] },
  );
  await act(async () => root.render(<RouterProvider router={router} />));
  const button = [...container.querySelectorAll("button")].find(
    (node) => node.textContent === "Import & inspect",
  )!;
  await act(async () => button.click());
});
afterEach(async () => {
  await act(async () => root.unmount());
  router.dispose();
  container.remove();
});
async function pendingFile() {
  let resolve!: (text: string) => void, reject!: (error: Error) => void;
  const file = new File(["{}"], "fixture.json", { type: "application/json" });
  const text = vi.fn(
    () =>
      new Promise<string>((yes, no) => {
        resolve = yes;
        reject = no;
      }),
  );
  Object.defineProperty(file, "text", { value: text });
  const input = container.querySelector<HTMLInputElement>("#transaction-file")!;
  Object.defineProperty(input, "files", { value: [file] });
  await act(async () =>
    input.dispatchEvent(new Event("change", { bubbles: true })),
  );
  expect(text).toHaveBeenCalledTimes(1);
  return { resolve, reject };
}
it("does not apply or parse a late file import after query-only navigation", async () => {
  const file = await pendingFile();
  await act(async () => {
    await router.navigate("/studio?draft=other");
  });
  await act(async () => file.resolve('{"type":"Tx ConwayEra","cborHex":"00"}'));
  expect(readTransaction).not.toHaveBeenCalled();
  expect(
    container.querySelector<HTMLTextAreaElement>("#transaction-cbor")!.value,
  ).toBe("");
  expect(container.textContent).not.toContain("Rejected fixture CBOR");
});
it("does not publish a stale file error after query-only navigation", async () => {
  const file = await pendingFile();
  await act(async () => {
    await router.navigate("/studio?draft=other");
  });
  await act(async () => file.reject(new Error("Old file read failed")));
  expect(container.textContent).not.toContain("Old file read failed");
});
it("keeps active file parsing errors visible instead of suppressing every import", async () => {
  const file = await pendingFile();
  const text = '{"type":"Tx ConwayEra","cborHex":"00"}';
  await act(async () => file.resolve(text));
  expect(readTransaction).toHaveBeenCalledTimes(1);
  expect(
    container.querySelector<HTMLTextAreaElement>("#transaction-cbor")!.value,
  ).toBe(text);
  expect(container.textContent).toContain("Rejected fixture CBOR");
});

it("releases the busy lock when a query navigation cancels a pending build", async () => {
  const buildMode = [...container.querySelectorAll("button")].find(
    (node) => node.textContent === "Build",
  )!;
  await act(async () => buildMode.click());
  for (const [id, value] of [
    ["funding-address", "addr_test1_fixture"],
    ["recipient-0", "addr_test1_receiver"],
    ["ada-0", "5"],
  ]) {
    const input = container.querySelector<HTMLInputElement>("#" + id)!;
    await act(async () => {
      Object.getOwnPropertyDescriptor(
        HTMLInputElement.prototype,
        "value",
      )!.set!.call(input, value);
      input.dispatchEvent(new Event("input", { bubbles: true }));
    });
  }
  let finish!: () => void;
  vi.mocked(buildPayment).mockImplementation(
    () =>
      new Promise((_resolve, reject) => {
        finish = () => reject(new Error("Old build failed"));
      }),
  );
  const build = [...container.querySelectorAll("button")].find(
    (node) => node.textContent === "Build unsigned transaction →",
  )!;
  await act(async () => build.click());
  expect(
    container.querySelector<HTMLInputElement>("#funding-address")!.disabled,
  ).toBe(true);
  await act(async () => {
    await router.navigate("/studio?draft=other");
  });
  await act(async () => finish());
  expect(
    container.querySelector<HTMLInputElement>("#funding-address")!.disabled,
  ).toBe(false);
  expect(container.textContent).not.toContain("Old build failed");
});

it("imports raw CBOR directly without an era selection step", async () => {
  expect(container.querySelector('[aria-label="Era for raw CBOR"]')).toBeNull();
  const file = await pendingFile();
  await act(async () => file.resolve("84a3008001800200a0f5f6"));
  expect(readTransaction).toHaveBeenCalledWith("84a3008001800200a0f5f6");
  expect(container.textContent).toContain("Rejected fixture CBOR");
});

it("inspects pasted CBOR immediately without another button click", async () => {
  const field = container.querySelector<HTMLTextAreaElement>("#transaction-cbor")!;
  const event = new Event("paste", { bubbles: true, cancelable: true });
  const cbor = "84a3008001800200a0f5f6";
  Object.defineProperty(event, "clipboardData", { value: { getData: () => cbor } });
  await act(async () => field.dispatchEvent(event));
  expect(readTransaction).toHaveBeenCalledWith(cbor);
  expect(field.value).toBe(cbor);
  expect(container.textContent).toContain("Rejected fixture CBOR");
});

it("opens a transaction passed from the explorer without another inspection step", async () => {
  const cbor = "84a3008001800200a0f5f6";
  await act(async () => router.navigate("/studio", { state: { transactionCbor: cbor } }));
  expect(readTransaction).toHaveBeenCalledWith(cbor);
  expect(container.querySelector<HTMLTextAreaElement>("#transaction-cbor")!.value).toBe(cbor);
  expect(container.textContent).toContain("Rejected fixture CBOR");
});

it.each(["file", "paste", "navigation"])("shows a successful %s import immediately", async (path) => {
  const cbor = "84a3008001800200a0f5f6";
  const tx = Core.Transaction.fromCbor(Core.TxCBOR(cbor));
  const id = Core.TransactionId("36fdff68dfe3660f1ceea60f018a0fd7a83da13def229108794c397a879b0436");
  // Use this fixture's actual digest without crossing jsdom and Node crypto realms.
  vi.spyOn(tx, "getId").mockReturnValue(id);
  vi.mocked(readTransaction).mockReturnValue({ cbor, tx, id, encoded: ["a3008001800200", "a0", "f5", "f6"], era: "ConwayEra", eraSource: "compatible", compatibleEras: ["ConwayEra", "BabbageEra"] });
  if (path === "file") {
    const file = await pendingFile();
    await act(async () => file.resolve(cbor));
  } else if (path === "navigation") {
    await act(async () => router.navigate("/studio", { state: { transactionCbor: cbor } }));
  } else {
    const event = new Event("paste", { bubbles: true, cancelable: true });
    Object.defineProperty(event, "clipboardData", { value: { getData: () => cbor } });
    await act(async () => container.querySelector("textarea")!.dispatchEvent(event));
  }
  expect(container.textContent).toContain("Transaction passport");
  expect(container.textContent).toContain(id);
  expect(container.querySelector('[role="alert"]')).toBeNull();
});

it("keeps the caret immediately after a mid-input paste", async () => {
  const field = container.querySelector<HTMLTextAreaElement>("#transaction-cbor")!;
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")!.set!.call(field, "aabbcc");
    field.dispatchEvent(new Event("input", { bubbles: true }));
  });
  field.setSelectionRange(2, 4);
  const event = new Event("paste", { bubbles: true, cancelable: true });
  Object.defineProperty(event, "clipboardData", { value: { getData: () => "dd" } });
  await act(async () => field.dispatchEvent(event));
  expect(field.value).toBe("aaddcc");
  expect(field.selectionStart).toBe(4);
  expect(field.selectionEnd).toBe(4);
  expect(readTransaction).toHaveBeenCalledWith("aaddcc");
});
