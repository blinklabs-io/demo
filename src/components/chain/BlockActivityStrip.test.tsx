import { act } from "react";
import { createRoot } from "react-dom/client";
import { expect, it, vi } from "vitest";
import { BlockActivityStrip } from "./BlockActivityStrip";
import type { BlockSummary } from "../../lib/explorer/recentBlocks";

it("plots actual transaction counts oldest first and selects the corresponding block", async () => {
  const blocks: BlockSummary[] = [30, 0, 10].map((tx_count, i) => ({
    tx_count,
    hash: String(3 - i).repeat(64),
    height: 3 - i,
    size: 1000,
    slot: 3 - i,
    time: 1700000003 - i,
    epoch: 1,
    epoch_slot: 3 - i,
    previous_block: "",
    slot_leader: "",
  }));
  const select = vi.fn();
  const host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  try {
    await act(async () =>
      root.render(
        <BlockActivityStrip
          blocks={blocks}
          selectedHash={blocks[0].hash}
          onSelect={select}
        />,
      ),
    );
    const buttons = host.querySelectorAll("button");
    expect([...buttons].map((b) => b.getAttribute("aria-label"))).toEqual([
      "Inspect block 1, 10 transactions",
      "Inspect block 2, 0 transactions",
      "Inspect block 3, 30 transactions",
    ]);
    expect(buttons[1].querySelector("i")?.style.height).toBe("0%");
    expect(buttons[2].querySelector("i")?.style.height).toBe("100%");
    expect(buttons[2].getAttribute("aria-pressed")).toBe("true");
    await act(async () => buttons[0].click());
    expect(select).toHaveBeenCalledExactlyOnceWith(blocks[2]);
  } finally {
    await act(async () => root.unmount());
    host.remove();
  }
});
