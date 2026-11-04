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
