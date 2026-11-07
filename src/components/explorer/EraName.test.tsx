import { act } from "react";
import { createRoot } from "react-dom/client";
import { QueryClient, QueryClientProvider, notifyManager } from "@tanstack/react-query";
import { expect, it, vi } from "vitest";
import { EraName } from "./EraName";

it.each([0, 3, 4, 5])("identifies Preprod epoch %s using timing for Byron and protocol versions afterward", async (epoch) => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  vi.mocked(fetch).mockImplementation(async (input) => {
    const url = String(input);
    if (url.endsWith("/network/eras")) return new Response(JSON.stringify([
      { start: { epoch: 0 }, end: { epoch: 4 }, parameters: { slot_length: 20, epoch_length: 21600 } },
      { start: { epoch: 4 }, end: null, parameters: { slot_length: 1, epoch_length: 432000 } },
    ]), { status: 200 });
    return epoch < 4
      ? new Response('{"message":"No protocol parameters"}', { status: 404 })
      : new Response(JSON.stringify({ protocol_major_ver: epoch === 4 ? 2 : 3 }), { status: 200 });
  });
  const container = document.createElement("div");
  const root = createRoot(container);
  notifyManager.setScheduler(queueMicrotask);
  try {
    await act(async () => root.render(<QueryClientProvider client={client}><EraName epoch={epoch} /></QueryClientProvider>));
    await act(async () => { await new Promise((resolve) => setTimeout(resolve, 20)); });
    expect(container.textContent).toBe(epoch < 4 ? "Byron" : epoch === 4 ? "Shelley" : "Allegra");
  } finally {
    await act(async () => root.unmount());
    client.clear();
    notifyManager.setScheduler((callback) => setTimeout(callback, 0));
  }
});

it("does not infer Byron from a missing parameter response without Byron timing", async () => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  client.setQueryData(["dingo", "network", "eras"], []);
  vi.mocked(fetch).mockResolvedValue(new Response('{"message":"Unavailable"}', { status: 404 }));
  const container = document.createElement("div");
  const root = createRoot(container);
  notifyManager.setScheduler(queueMicrotask);
  try {
    await act(async () => root.render(<QueryClientProvider client={client}><EraName epoch={0} /></QueryClientProvider>));
    await act(async () => { await new Promise((resolve) => setTimeout(resolve, 20)); });
    expect(container.textContent).toBe("Era unavailable");
  } finally {
    await act(async () => root.unmount());
    client.clear();
    notifyManager.setScheduler((callback) => setTimeout(callback, 0));
  }
});
