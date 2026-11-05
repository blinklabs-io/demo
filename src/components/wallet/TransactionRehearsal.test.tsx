// @vitest-environment node
import { createRequire } from "node:module";
const { JSDOM } = createRequire(import.meta.url)("jsdom");
import { TransactionOutputs } from "./TransactionOutputs";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { Core } from "@blaze-cardano/sdk";
import { afterAll, beforeAll, expect, it, vi } from "vitest";
import {
  TransactionRehearsal,
  TransactionRehearsalCbor,
} from "./TransactionRehearsal";
const dom = new JSDOM("<!doctype html><html><body></body></html>", {
  url: "http://localhost",
});
beforeAll(async () => {
  Object.assign(globalThis, {
    window: dom.window,
    document: dom.window.document,
    MouseEvent: dom.window.MouseEvent,
  });
  await Core.initCrypto();
});
afterAll(() => dom.window.close());
const credential = (hex: string) => ({
  type: Core.CredentialType.KeyHash,
  hash: Core.Hash28ByteBase16(hex.repeat(28)),
});
const address = (hex: string) =>
  Core.addressFromCredential(0, Core.Credential.fromCore(credential(hex)));
const asset = Core.AssetId("ab".repeat(28) + "746f6b656e");
function fixture() {
  const input = (hash: string) =>
    new Core.TransactionInput(Core.TransactionId(hash.repeat(32)), 0n);
  const set = (hash: string) =>
    Core.CborSet.fromCore(
      [input(hash).toCore()],
      Core.TransactionInput.fromCore,
    );
  const first = new Core.Value(3000000n),
    second = new Core.Value(1000000n);
  first.setMultiasset(new Map([[asset, 1n]]));
  second.setMultiasset(new Map([[asset, 3n]]));
  const body = new Core.TransactionBody(
    set("11"),
    [
      new Core.TransactionOutput(address("11"), first),
      new Core.TransactionOutput(address("22"), second),
    ],
    200000n,
  );
  body.setReferenceInputs(set("33"));
  body.setCollateral(set("44"));
  body.setTotalCollateral(300000n);
  body.setCollateralReturn(
    new Core.TransactionOutput(address("55"), new Core.Value(1700000n)),
  );
  body.setWithdrawals(
    new Map([
      [Core.Cardano.RewardAccount.fromCredential(credential("66"), 0), 500000n],
    ]),
  );
  body.setMint(new Map([[asset, -2n]]));
  return new Core.Transaction(body, new Core.TransactionWitnessSet());
}
async function render(element: React.ReactNode) {
  const host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  await act(async () => root.render(element));
  return {
    host,
    root,
    close: async () => {
      await act(async () => root.unmount());
      host.remove();
    },
  };
}
it("allocates actual outputs independently of fees, switches assets, and inspects full destinations", async () => {
  const tx = fixture(),
    original = tx.toCbor(),
    { host, close } = await render(<TransactionRehearsal tx={tx} />);
  try {
    const segments = () => [
      ...host.querySelectorAll<HTMLButtonElement>(
        ".rehearsal-allocation button",
      ),
    ];
    expect(segments().map((button) => button.style.width)).toEqual([
      "75%",
      "25%",
    ]);
    expect(
      host.querySelector(".rehearsal-allocation-heading strong")?.textContent,
    ).toBe("4.00 ADA");
    expect(host.querySelector(".rehearsal-output code")?.textContent).toBe(
      address("11").toBech32(),
    );
    const select = host.querySelector<HTMLSelectElement>("select")!;
    await act(async () => {
      select.value = asset;
      select.dispatchEvent(new dom.window.Event("change", { bubbles: true }));
    });
    expect(host.querySelector(".rehearsal-asset-id code")?.textContent).toBe(
      asset,
    );
    expect(segments().map((button) => button.style.width)).toEqual([
      "25%",
      "75%",
    ]);
    await act(async () => segments()[1].click());
    expect(
      host.querySelector(".rehearsal-output")?.getAttribute("aria-label"),
    ).toBe("Selected output 2");
    expect(host.querySelector(".rehearsal-output code")?.textContent).toBe(
      address("22").toBech32(),
    );
    expect(
      host
        .querySelector(".rehearsal-output button")
        ?.getAttribute("aria-label"),
    ).toBe("Copy full output 2 address");
    expect(tx.toCbor()).toBe(original);
  } finally {
    await close();
  }
});
it("keeps collateral and read-only references separate from successful outputs and supply effects", async () => {
  const { host, close } = await render(<TransactionRehearsal tx={fixture()} />);
  try {
    expect(host.querySelector(".rehearsal-reference")?.textContent).toContain(
      "1 reference inputs",
    );
    const collateral = host.querySelector(".rehearsal-collateral")!;
    expect(collateral.textContent).toContain("not spent when scripts succeed");
    expect(collateral.textContent).toContain(
      "0.30 ADA declared total collateral",
    );
    expect(collateral.textContent).toContain("Collateral return · 1.70 ADA");
    expect(host.querySelector(".rehearsal-effects")?.textContent).toContain(
      "0.50 ADA",
    );
    expect(host.querySelector(".rehearsal-effects")?.textContent).toContain(
      "0 minted assets · 1 burned assets",
    );
    expect(host.querySelector(".rehearsal-effects code")?.textContent).toBe(
      asset,
    );
    expect(host.querySelector(".rehearsal-effects")?.textContent).toContain(
      "-2 raw units",
    );
    expect(
      host.querySelectorAll(".rehearsal-output-choices button"),
    ).toHaveLength(2);
  } finally {
    await close();
  }
});
it("marks ordinary output and reward effects as not applied for a false script flag", async () => {
  const tx = Core.Transaction.fromCore({
    ...fixture().toCore(),
    isValid: false,
  });
  const { host, close } = await render(<TransactionRehearsal tx={tx} />);
  try {
    expect(host.querySelector(".rehearsal-state")?.textContent).toBe(
      "Script-invalid flag",
    );
    expect(host.querySelector(".rehearsal-path")?.textContent).toContain(
      "outputs not applied",
    );
    expect(host.querySelector(".rehearsal-effects")?.textContent).toContain(
      "Reward withdrawals · not applied",
    );
    expect(host.querySelector(".rehearsal-collateral")?.textContent).toContain(
      "Spending inputs and ordinary outputs are not applied",
    );
  } finally {
    await close();
  }
});
it("decodes CBOR locally, reports malformed input, and replaces stale rehearsal when CBOR changes", async () => {
  const fetch = vi
    .spyOn(globalThis, "fetch")
    .mockRejectedValue(new Error("No network expected"));
  const { host, root, close } = await render(
    <TransactionRehearsalCbor cbor={fixture().toCbor()} />,
  );
  try {
    expect(host.querySelector(".transaction-rehearsal")).not.toBeNull();
    await act(async () => root.render(<TransactionRehearsalCbor cbor="00" />));
    expect(host.querySelector('[role="alert"]')?.textContent).toContain(
      "Transaction rehearsal unavailable",
    );
    expect(host.querySelector(".transaction-rehearsal")).toBeNull();
    expect(fetch).not.toHaveBeenCalled();
  } finally {
    fetch.mockRestore();
    await close();
  }
});

it("renders Byron output and collateral-return destinations without changing their encoding", async () => {
  const byron = Core.Cardano.ByronAddress.fromCredentials(
    Core.Hash28ByteBase16("99".repeat(28)),
    { magic: 1 },
    Core.Cardano.ByronAddressType.PubKey,
  ).toAddress();
  const tx = fixture();
  const body = tx.body();
  body.setOutputs([
    new Core.TransactionOutput(byron, new Core.Value(2000000n)),
  ]);
  body.setCollateralReturn(
    new Core.TransactionOutput(byron, new Core.Value(1700000n)),
  );
  tx.setBody(body);
  const { host, close } = await render(<TransactionOutputs tx={tx} />);
  try {
    expect(host.querySelector(".rehearsal-output code")?.textContent).toBe(
      byron.toBase58(),
    );
    expect(host.querySelector(".rehearsal-collateral code")?.textContent).toBe(
      byron.toBase58(),
    );
  } finally {
    await close();
  }
});
