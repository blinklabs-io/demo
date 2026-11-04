import { act } from "react";
import { createRoot } from "react-dom/client";
import { expect, it, vi } from "vitest";
import ApiConsole from "./ApiConsole";

const request = vi.hoisted(() => ({ run: vi.fn() }));
vi.mock("../lib/dingo/blockfrost", () => ({
  blockfrostFetchResponse: request.run,
  BlockfrostError: class extends Error {},
}));

it("ignores a completed response after the request context changes", async () => {
  let finish!: (response: Response) => void;
  request.run.mockImplementation(
    () => new Promise<Response>((resolve) => { finish = resolve; }),
  );
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  try {
    await act(async () => root.render(<ApiConsole />));
    await act(async () => {
      container.querySelector("form")!.dispatchEvent(
        new Event("submit", { bubbles: true, cancelable: true }),
      );
    });
    expect(request.run).toHaveBeenCalledOnce();
    await act(async () => {
      const target = container.querySelector<HTMLSelectElement>("#api-target")!;
      target.value = "mesh";
      target.dispatchEvent(new Event("change", { bubbles: true }));
    });
    await act(async () => {
      finish(new Response('{"stale-response":true}'));
    });
    expect(container.textContent).not.toContain("stale-response");
    expect(container.querySelector("button[type=submit]")?.textContent).toBe(
      "Execute POST",
    );
  } finally {
    await act(async () => root.unmount());
    container.remove();
  }
});
