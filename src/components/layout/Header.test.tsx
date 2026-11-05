import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router";
import { describe, expect, it, vi } from "vitest";
import { Header } from "./Header";

vi.mock("./GlobalLookup", () => ({ GlobalLookup: () => null }));
vi.mock("./NodeHealthStrip", () => ({ NodeHealthStrip: () => null }));

function render(path: string) {
  return renderToStaticMarkup(
    <MemoryRouter initialEntries={[path]}>
      <Header />
    </MemoryRouter>,
  );
}

describe("Header grouped navigation", () => {
  it("marks the group selected without announcing a current page", () => {
    const html = render("/participate");
    expect(html).toContain("selected");
    expect(html).not.toContain('aria-current="page"');
  });
});

it("highlights creation tools as a section without claiming its parent is the current page", () => {
  const container = document.createElement("div");
  container.innerHTML = render("/wallet/tools/mint");
  const link = container.querySelector('a[href="/wallet/tools"]');
  expect(link?.classList.contains("selected")).toBe(true);
  expect(link?.hasAttribute("aria-current")).toBe(false);
});
