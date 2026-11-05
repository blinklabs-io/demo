import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { BlockfrostError } from "../../lib/dingo/blockfrost";
import { QueryState } from "./QueryState";

function render(error: unknown, hasData = false) {
  return renderToStaticMarkup(
    <QueryState isLoading={false} error={error} hasData={hasData}>
      <strong>Last loaded record</strong>
    </QueryState>,
  );
}

describe("read query result states", () => {
  it("retains the last successful record when a background refresh fails", () => {
    const html = render(new Error("Node unavailable"), true);
    expect(html).toContain("Last loaded record");
    expect(html).toContain("previously loaded data");
    expect(html).toContain("Node unavailable");
  });
  it("does not manufacture usable data after an initial failure", () => {
    expect(render(new Error("Node unavailable"))).not.toContain("Last loaded record");
  });
  it("removes a cached record when the authoritative response is not found", () => {
    expect(render(new BlockfrostError("Gone", 404, "/record"), true)).not.toContain("Last loaded record");
  });
  it("keeps a successful empty result distinct from failure", () => {
    const html = renderToStaticMarkup(
      <QueryState isLoading={false} error={null} hasData>
        <p>No records</p>
      </QueryState>,
    );
    expect(html).toContain("No records");
    expect(html).not.toContain("unavailable");
  });
});

it("keeps an open stateful disclosure mounted across background error and recovery", async () => {
  const { act } = await import("react");
  const { createRoot } = await import("react-dom/client");
  const { LazyDisclosure } = await import("./LazyDisclosure");
  const container = document.createElement("div");
  const root = createRoot(container);
  const view = (error: Error | null) => <QueryState isLoading={false} error={error} hasData><LazyDisclosure title="Records"><span>Loaded records</span></LazyDisclosure></QueryState>;
  try {
    await act(async () => root.render(view(null)));
    const disclosure = container.querySelector("details")!;
    await act(async () => { disclosure.open = true; disclosure.dispatchEvent(new Event("toggle")); });
    expect(container.textContent).toContain("Loaded records");
    await act(async () => root.render(view(new Error("Refresh failed"))));
    expect(container.querySelector("details")).toBe(disclosure);
    expect(container.textContent).toContain("Loaded records");
    await act(async () => root.render(view(null)));
    expect(container.querySelector("details")).toBe(disclosure);
    expect(disclosure.open).toBe(true);
    expect(container.textContent).toContain("Loaded records");
  } finally { await act(async () => root.unmount()); }
});
