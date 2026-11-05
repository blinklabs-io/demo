import { act } from "react";
import { createRoot } from "react-dom/client";
import { QueryClient, QueryClientProvider, notifyManager } from "@tanstack/react-query";
import { afterEach, expect, it, vi } from "vitest";
import { PaginatedList } from "./PaginatedList";

afterEach(() => notifyManager.setScheduler((callback) => setTimeout(callback, 0)));

it.each([40, undefined])("uses an authoritative total or distinguishes the end of a nonempty list (total %s)", async (totalItems) => {
  notifyManager.setScheduler(queueMicrotask);
  const full = Array.from({ length: 20 }, (_, index) => `record-${index}`);
  vi.mocked(fetch).mockResolvedValueOnce(new Response(JSON.stringify(full)))
    .mockResolvedValueOnce(new Response(JSON.stringify(full)))
    .mockResolvedValueOnce(new Response("[]"));
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity } } });
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  const next = () => [...container.querySelectorAll("button")].find((button) => button.textContent === "Next")!;
  try {
    await act(async () => root.render(
      <QueryClientProvider client={client}>
        <PaginatedList<string>
          queryKey={["records"]}
          totalItems={totalItems}
          buildUrl={(page, count) => `/records?page=${page}&count=${count}`}
          keyFor={(row) => row}
          renderItem={(row) => <span>{row}</span>}
          emptyLabel="No records exist."
        />
      </QueryClientProvider>,
    ));
    expect(container.querySelectorAll("li")).toHaveLength(20);
    await act(async () => next().click());
    expect(container.textContent).toContain("Page 2");
    expect(container.querySelectorAll("li")).toHaveLength(20);
    if (totalItems !== undefined) {
      expect(next().disabled).toBe(true);
      expect(fetch).toHaveBeenCalledTimes(2);
    } else {
      await act(async () => next().click());
      expect(container.textContent).toContain("No more records.");
      expect(container.textContent).not.toContain("No records exist.");
      expect(fetch).toHaveBeenCalledTimes(3);
    }
  } finally {
    await act(async () => root.unmount());
    client.clear();
    container.remove();
  }
});


it("keeps backward navigation available after a later page fails", async () => {
  notifyManager.setScheduler(queueMicrotask);
  const full = Array.from({ length: 20 }, (_, index) => `record-${index}`);
  vi.mocked(fetch).mockResolvedValueOnce(new Response(JSON.stringify(full)))
    .mockResolvedValueOnce(new Response('{"message":"Temporary failure"}', { status: 503 }));
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Infinity } } });
  const container = document.createElement("div");
  const root = createRoot(container);
  const button = (label: string) => [...container.querySelectorAll("button")].find((node) => node.textContent === label);
  try {
    await act(async () => root.render(
      <QueryClientProvider client={client}>
        <PaginatedList<string>
          queryKey={["records"]}
          buildUrl={(page, count) => `/records?page=${page}&count=${count}`}
          keyFor={(row) => row}
          renderItem={(row) => <span>{row}</span>}
        />
      </QueryClientProvider>,
    ));
    await act(async () => button("Next")!.click());
    expect(container.textContent).toContain("Temporary failure");
    expect(button("Previous")).toBeDefined();
    expect(button("Previous")!.disabled).toBe(false);
    await act(async () => button("Previous")!.click());
    expect(container.querySelectorAll("li")).toHaveLength(20);
    expect(container.textContent).not.toContain("Temporary failure");
    expect(fetch).toHaveBeenCalledTimes(2);
  } finally {
    await act(async () => root.unmount());
    client.clear();
    notifyManager.setScheduler((callback) => setTimeout(callback, 0));
  }
});
