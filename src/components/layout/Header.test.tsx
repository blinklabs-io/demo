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
