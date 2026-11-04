import { act } from "react";
import { createRoot } from "react-dom/client";
import { expect, it } from "vitest";
import { BlockfrostError } from "../../lib/dingo/blockfrost";
import { QueryState } from "./QueryState";

it("keeps a record hidden when a refresh error follows a not-found response", async () => {
  const container = document.createElement("div");
  const root = createRoot(container);
  const show = (error: unknown) =>
    act(async () =>
      root.render(
        <QueryState isLoading={false} error={error} hasData>
          <strong>Last loaded record</strong>
        </QueryState>,
      ),
    );
  await show(null);
  expect(container.textContent).toContain("Last loaded record");
  await show(new BlockfrostError("Gone", 404, "/record"));
  expect(container.textContent).not.toContain("Last loaded record");
  await show(new Error("Node unavailable"));
  expect(container.textContent).not.toContain("Last loaded record");
  expect(container.textContent).toContain("Node unavailable");
  await show(null);
  expect(container.textContent).toContain("Last loaded record");
  await act(async () => root.unmount());
});
