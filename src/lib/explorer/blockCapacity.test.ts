import { Core } from "@blaze-cardano/sdk";
import { expect, it } from "vitest";
import { hexToBytes } from "../dingo/utxorpc/bytes";
import { blockResourceUsage, decodeBlockResources } from "./blockCapacity";

const header = `828a${"00".repeat(6)}18190000820b0040`;

it("sums declared budgets across witnesses, including an invalid transaction", () => {
  // Two transaction witness sets: list and map redeemer encodings.
  const block = `85${header}8082a1058184000000820304a105a18201008200820506808101`;
  expect(decodeBlockResources(hexToBytes(block))).toEqual({ bytes: 25, memory: 8n, steps: 10n });
});

it("decodes zero script usage without inventing a budget", () => {
  expect(decodeBlockResources(hexToBytes(`84${header}8081a0a0`))).toEqual({ bytes: 25, memory: 0n, steps: 0n });
});

it("rejects truncated witness data instead of showing partial execution usage", () => {
  expect(() => decodeBlockResources(hexToBytes(`85${header}8081a10581840000008203`))).toThrow();
});

it.each(["Body bytes", "Execution memory", "Execution steps"])("marks a block full when %s reaches its limit", (label) => {
  const limits = { bytes: 100, memory: 20n, steps: 1000n };
  const usage = blockResourceUsage(label === "Body bytes" ? 100 : 10, {
    memory: label === "Execution memory" ? 20n : 1n,
    steps: label === "Execution steps" ? 1000n : 1n,
  }, limits);
  expect(usage.percent).toBe(100);
  expect(usage.bottleneck.label).toBe(label);
});

it("uses the largest resource fraction rather than adding unrelated percentages", () => {
  const usage = blockResourceUsage(25, { memory: 9n, steps: 70n }, { bytes: 100, memory: 10n, steps: 100n });
  expect(usage.percent).toBe(90);
  expect(usage.bottleneck.label).toBe("Execution memory");
});

it("does not round a resource below its limit up to a full gauge", () => {
  const usage = blockResourceUsage(999, { memory: 999999n, steps: 0n }, { bytes: 1000, memory: 1000000n, steps: 100n });
  expect(usage.percent).toBe(99.9);
  expect(usage.bottleneck.label).toBe("Execution memory");
});

it("distinguishes epochs without execution budgets from missing or zero limits", () => {
  expect(blockResourceUsage(25, { memory: 0n, steps: 0n }, { bytes: 100, memory: null, steps: null }).percent).toBe(25);
  expect(() => blockResourceUsage(25, { memory: 1n, steps: 0n }, { bytes: 100, memory: null, steps: null })).toThrow();
  expect(() => blockResourceUsage(25, { memory: 0n, steps: 0n }, { bytes: 100, memory: 0n, steps: 100n })).toThrow();
});

it("reads SDK-encoded large execution units without rounding their totals", () => {
  const writer = new Core.CborWriter();
  writer.writeStartArray(4).writeInt(0).writeInt(0).writeInt(0).writeStartArray(2).writeInt(9007199254740993n).writeInt(9007199254740995n);
  const redeemer = writer.encodeAsHex();
  const bytes = hexToBytes(`84${header}8081a10581${redeemer}a0`);
  expect(decodeBlockResources(bytes)).toEqual({ bytes: 25, memory: 9007199254740993n, steps: 9007199254740995n });
});
