// @vitest-environment node
import { Core } from "@blaze-cardano/sdk";
import { expect, it, vi } from "vitest";
import { bridgePlan, PRIME_BRIDGE_ADDRESS } from "./plan";
vi.mock("../dingo/config", () => ({ DINGO_NETWORK: { id: "prime-testnet", networkMagic: 3311 } }));
const address = (network: number) => Core.addressFromCredential(network, Core.Credential.fromCore({ type: Core.CredentialType.KeyHash, hash: Core.Hash28ByteBase16("22".repeat(28)) })).toBech32();
const settings = { minimum: 1000000n, maximum: 1000000000000n, fee: 1000010n, destinations: ["vector", "nexus"] as ("vector" | "nexus")[], paused: false };
it.each(["vector", "nexus"] as const)("encodes %s routing and the exact amount plus fee", (destination) => {
  const target = destination === "nexus" ? "0x" + "ab".repeat(20) : address(1);
  const plan = bridgePlan({ destination, address: target, amount: "10.000001" }, address(0), settings);
  expect(plan.output.address().toBech32()).toBe(PRIME_BRIDGE_ADDRESS);
  expect(plan.output.amount().coin()).toBe(11000011n);
  const payload = plan.metadata.toCore().get(1n) as Map<Core.Cardano.Metadatum, Core.Cardano.Metadatum>;
  expect(payload.get("d")).toBe(destination);
  expect(payload.get("fa")).toBe(1000010n);
  expect(payload.get("s")).toEqual([address(0).slice(0, 40), address(0).slice(40)]);
  expect(payload.get("t")).toBe("bridge");
  const transfer = (payload.get("tx") as Map<string, unknown>[])[0];
  expect(transfer.get("m")).toBe(10000001n);
  expect((transfer.get("a") as string[]).join("")).toBe(destination === "nexus" ? target.slice(2) : target);
  expect(plan.metadata.toCore().size).toBe(1);
});
it.each([
  ["vector", address(0)], ["nexus", "0x" + "00".repeat(20)], ["nexus", "0x1234"],
] as const)("rejects invalid %s destinations before building", (destination, target) => {
  expect(() => bridgePlan({ destination, address: target, amount: "10" }, address(0), settings)).toThrow(/address/);
});
it("enforces live availability, amount limits and six decimal precision", () => {
  const action = { destination: "vector" as const, address: address(1), amount: "10" };
  expect(() => bridgePlan(action, address(0), { ...settings, paused: true })).toThrow(/not available/);
  expect(() => bridgePlan(action, address(0), { ...settings, destinations: [] })).toThrow(/not available/);
  for (const [amount, reason] of [["0", "current transfer limits"], ["0.999999", "current transfer limits"], ["1000000.000001", "current transfer limits"], ["1.0000001", "up to 6 decimal"], ["-1", "up to 6 decimal"]])
    expect(() => bridgePlan({ ...action, amount }, address(0), settings)).toThrow(reason);
});

it("canonicalizes an uppercase Vector Bech32 destination", () => {
  const plan = bridgePlan({ destination: "vector", address: address(1).toUpperCase(), amount: "10" }, address(0), settings);
  expect(plan.address).toBe(address(1));
});
