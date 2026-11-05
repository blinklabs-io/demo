import { act } from "react";
import { createRoot } from "react-dom/client";
import { MemoryRouter } from "react-router";
import { Core } from "@blaze-cardano/sdk";
import { expect, it, vi } from "vitest";
import { UtxoConstellation } from "./UtxoConstellation";
vi.mock("../NetworkLink", () => ({
  Link: ({ to, children }: { to: string; children: React.ReactNode }) => (
    <a href={to}>{children}</a>
  ),
}));
const output = new Core.TransactionUnspentOutput(
  new Core.TransactionInput(Core.TransactionId("11".repeat(32)), 0n),
  new Core.TransactionOutput(
    Core.addressFromCredential(
      0,
      Core.Credential.fromCore({
        type: Core.CredentialType.KeyHash,
        hash: Core.Hash28ByteBase16("22".repeat(28)),
      }),
    ),
    new Core.Value(123000000n),
  ),
);
it("inspects contract outputs with the keyboard while keeping wallet selection separate", async () => {
  vi.spyOn(output.output().address(), "toBech32").mockReturnValue(
    "addr_test1fixture" as Core.PaymentAddress,
  );
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container),
    toggle = vi.fn();
  try {
    await act(async () =>
      root.render(
        <MemoryRouter>
          <UtxoConstellation outputs={[output]} inspectOnly />
        </MemoryRouter>,
      ),
    );
    const node = container.querySelector('[role="button"]')!;
    await act(async () =>
      node.dispatchEvent(
        new KeyboardEvent("keydown", { key: "Enter", bubbles: true }),
      ),
    );
    expect(
      container.querySelector(".constellation-inspector")?.textContent,
    ).toContain("123.00 ADA");
    expect(container.querySelector('[role="checkbox"]')).toBeNull();
    expect(container.textContent).not.toContain("selected ·");
    await act(async () =>
      root.render(
        <MemoryRouter>
          <UtxoConstellation
            outputs={[output]}
            selected={[]}
            onToggle={toggle}
          />
        </MemoryRouter>,
      ),
    );
    await act(async () =>
      container
        .querySelector('[role="checkbox"]')!
        .dispatchEvent(
          new KeyboardEvent("keydown", { key: " ", bubbles: true }),
        ),
    );
    expect(toggle).toHaveBeenCalledWith("11".repeat(32) + "#0");
  } finally {
    await act(async () => root.unmount());
    container.remove();
  }
});
