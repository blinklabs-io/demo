import { act, useState } from "react";
import { createRoot } from "react-dom/client";
import { MemoryRouter } from "react-router";
import { expect, it } from "vitest";
import {
  HeaderVersionChart,
  type VersionRecord,
  type HeaderVersionSelection,
} from "./HeaderVersionChart";
const end = 1800000000,
  start = end - 86400;
const record = (
  height: number,
  minor = "1",
  time = start + 1800,
): VersionRecord => ({
  hash: height.toString(16).padStart(64, "0"),
  height,
  time,
  major: "11",
  minor,
});
function Chart({
  records,
  complete,
}: {
  records: VersionRecord[];
  complete: boolean;
}) {
  const [selection, setSelection] = useState<HeaderVersionSelection>({
    scope: { kind: "alternatives" },
    page: 0,
  });
  return (
    <HeaderVersionChart
      records={records}
      startTime={start}
      endTime={end}
      complete={complete}
      selection={selection}
      onSelectionChange={setSelection}
    />
  );
}
async function render(records: VersionRecord[], complete = true) {
  const host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  await act(async () =>
    root.render(
      <MemoryRouter initialEntries={["/explorer?network=preview"]}>
        <Chart records={records} complete={complete} />
      </MemoryRouter>,
    ),
  );
  return {
    host,
    close: async () => {
      await act(async () => root.unmount());
      host.remove();
    },
  };
}
it("keeps a single alternative block visible and filters to every exact matching header", async () => {
  const rows = [
    ...Array.from({ length: 99 }, (_, i) => record(i + 1)),
    record(100, "69"),
  ];
  const { host, close } = await render(rows);
  try {
    expect(host.querySelectorAll(".header-node-legend button")).toHaveLength(2);
    const dingo = [
      ...host.querySelectorAll<HTMLButtonElement>(".header-node-legend button"),
    ].find((b) => b.textContent?.includes("Dingo"))!;
    expect(dingo.textContent).toContain("1.00%");
    expect(host.querySelectorAll(".header-hour-markers i")).toHaveLength(1);
    expect(host.querySelectorAll(".header-history-blocks a")).toHaveLength(1);
    await act(async () => dingo.click());
    expect(host.querySelector(".header-history-records h3")?.textContent).toBe(
      "1 verified block",
    );
    expect(
      host.querySelector(".header-history-blocks a")?.getAttribute("href"),
    ).toContain(rows[99].hash);
  } finally {
    await close();
  }
});
it("labels partial counts and pages all blocks without rendering thousands of links", async () => {
  const { host, close } = await render(
    Array.from({ length: 25 }, (_, i) => record(i + 1)),
    false,
  );
  try {
    expect(host.textContent).toContain("of verified blocks");
    expect(host.textContent).toContain("Verified blocks so far");
    expect(host.textContent).toContain(
      "No alternative or unidentified producer signals",
    );
    const all = [...host.querySelectorAll<HTMLButtonElement>("button")].find(
      (b) => b.textContent === "All blocks",
    )!;
    await act(async () => all.click());
    expect(host.querySelectorAll(".header-history-blocks a")).toHaveLength(12);
    const next = [...host.querySelectorAll<HTMLButtonElement>("button")].find(
      (b) => b.textContent === "Next →",
    )!;
    await act(async () => next.click());
    await act(async () => next.click());
    expect(host.querySelectorAll(".header-history-blocks a")).toHaveLength(1);
    expect(host.querySelector(".header-history-pages")?.textContent).toContain(
      "3 / 3",
    );
  } finally {
    await close();
  }
});
it("uses hourly boundaries and full versions while excluding out-of-window cache entries", async () => {
  const { host, close } = await render([
    record(1, "1", start - 1),
    record(2, "65", start + 10),
    record(3, "67", start + 3600),
    record(4, "2", end),
    record(5, "69", end + 1),
  ]);
  try {
    expect(host.querySelectorAll(".header-node-legend button")).toHaveLength(3);
    expect(host.textContent).toContain("Amaru");
    expect(host.textContent).toContain("cardano-bean");
    expect(host.textContent).not.toContain("Dingo");
    const hours = host.querySelectorAll<HTMLButtonElement>(
      ".header-hour-chart button",
    );
    expect(hours).toHaveLength(24);
    await act(async () => hours[0].click());
    expect(host.querySelectorAll(".header-history-blocks a")).toHaveLength(1);
    expect(host.querySelector(".header-history-blocks")?.textContent).toContain(
      "11.65",
    );
    expect(hours[0].querySelectorAll(".header-hour-markers i")).toHaveLength(1);
    await act(async () => hours[1].click());
    expect(host.querySelectorAll(".header-history-blocks a")).toHaveLength(1);
    expect(host.querySelector(".header-history-blocks")?.textContent).toContain(
      "11.67",
    );
    expect(hours[1].querySelectorAll(".header-hour-markers i")).toHaveLength(1);
    await act(async () => hours[2].click());
    expect(host.querySelectorAll(".header-history-blocks a")).toHaveLength(0);
    expect(hours[2].querySelectorAll(".header-hour-markers i")).toHaveLength(0);
    await act(async () => hours[23].click());
    expect(host.querySelector(".header-history-blocks")?.textContent).toContain(
      "11.2",
    );
  } finally {
    await close();
  }
});

it("keeps Haskell header versions in separate pie slices with exact percentages and filters", async () => {
  const rows = [
    ...Array.from({ length: 48 }, (_, i) => record(i + 1, "1")),
    ...Array.from({ length: 50 }, (_, i) => record(i + 49, "2")),
    record(99, "69"),
    record(100, "65"),
  ];
  const { host, close } = await render(rows);
  try {
    const legend = host.querySelector(".header-node-legend")!;
    expect(legend.querySelectorAll("button")).toHaveLength(4);
    const version = [
      ...legend.querySelectorAll<HTMLButtonElement>("button"),
    ].find((button) => button.textContent?.includes("11.1"))!;
    expect(version.textContent).toContain("48.00%");
    expect(version.textContent).toContain("48 blocks");
    expect(host.querySelectorAll(".header-node-pie path")).toHaveLength(4);
    await act(async () => version.click());
    expect(host.querySelector(".header-history-records h3")?.textContent).toBe(
      "48 verified blocks",
    );
    expect(host.querySelector(".header-history-blocks")?.textContent).toContain(
      "11.1",
    );
    expect(
      host.querySelector(".header-history-blocks")?.textContent,
    ).not.toContain("11.2");
  } finally {
    await close();
  }
});
it("keeps the full-circle single-node pie selectable by keyboard", async () => {
  const { host, close } = await render([record(1, "1"), record(2, "1")]);
  try {
    const slice = host.querySelector('.header-node-pie [role="button"]')!;
    expect(slice.getAttribute("aria-label")).toContain("100.00%");
    expect(slice.getAttribute("d")?.match(/A115/g)).toHaveLength(2);
    await act(async () =>
      slice.dispatchEvent(
        new KeyboardEvent("keydown", { key: "Enter", bubbles: true }),
      ),
    );
    expect(slice.getAttribute("aria-pressed")).toBe("true");
    expect(host.querySelector(".header-history-records h3")?.textContent).toBe(
      "2 verified blocks",
    );
  } finally {
    await close();
  }
});
it("gives different full Haskell versions distinct chart colors", async () => {
  const { host, close } = await render([
    { ...record(1, "0"), major: "10" },
    record(2, "0"),
    record(3, "1"),
    record(4, "2"),
  ]);
  try {
    const fills = [...host.querySelectorAll(".header-node-pie path")].map((p) =>
      p.getAttribute("fill"),
    );
    expect(new Set(fills).size).toBe(4);
  } finally {
    await close();
  }
});
it("displays packed producer signals consistently in the chart and inspection list", async () => {
  const { host, close } = await render([
    record(1, "315973"),
    record(2, String((1234 << 8) | 65)),
    record(3, "67"),
    record(4, "255"),
    record(5, "1073741893"),
  ]);
  try {
    const legend = host.querySelector(".header-node-legend")!;
    expect(legend.textContent).toContain("Dingo");
    expect(legend.textContent).toContain("Amaru");
    expect(legend.textContent).toContain("Gerolamo / cardano-bean");
    expect(legend.textContent).toContain("Identity withheld");
    expect(legend.textContent).toContain("Unsupported scheme 1");
    const dingo = [
      ...legend.querySelectorAll<HTMLButtonElement>("button"),
    ].find((b) => b.textContent?.includes("Dingo"))!;
    expect(dingo.title).toContain("opaque payload 1234");
    await act(async () => dingo.click());
    expect(host.querySelectorAll(".header-history-blocks a")).toHaveLength(1);
    expect(host.querySelector(".header-history-blocks")?.textContent).toContain(
      "11.315973",
    );
  } finally {
    await close();
  }
});
