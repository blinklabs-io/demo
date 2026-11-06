import { act } from "react";
import { createRoot } from "react-dom/client";
import { MemoryRouter } from "react-router";
import { expect, it } from "vitest";
import { HashLink } from "./HashLink";
import { Field } from "./Panel";
it("retains complete identifiers and exposes separate copy controls beside their links", async () => {
  const hash = "ab".repeat(32),
    poolHash = "cd".repeat(28);
  const host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  try {
    await act(async () =>
      root.render(
        <MemoryRouter>
          <HashLink kind="tx" id={hash} />
          <Field label="Pool key hash (hex)" value={poolHash} />
        </MemoryRouter>,
      ),
    );
    expect(host.querySelector("a")?.textContent).toBe(hash);
    expect(host.querySelector("a")?.getAttribute("href")).toContain(
      `/explorer/tx/${hash}`,
    );
    expect(host.querySelector("a button")).toBeNull();
    expect(
      host.querySelector('button[aria-label="Copy full tx ID"]'),
    ).not.toBeNull();
    expect(host.querySelector(".identifier-text")?.textContent).toBe(poolHash);
    expect(
      host.querySelector('button[aria-label="Copy full pool key hash (hex)"]'),
    ).not.toBeNull();
  } finally {
    await act(async () => root.unmount());
    host.remove();
  }
});
