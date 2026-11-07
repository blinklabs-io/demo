import { Core } from "@blaze-cardano/sdk";
import { expect, it } from "vitest";
import { hexToBytes } from "../dingo/utxorpc/bytes";
import { blockResourceUsage, decodeBlockResources } from "./blockCapacity";

const header = `828a${"00".repeat(6)}18190000820b0040`;
const dijkstraHeader = `828c${"00".repeat(6)}18190000820c00f4f640`;

it("reads Dijkstra full transactions with final validity flags and extended witness keys", () => {
  const witness = "a205a18207008200820304088140";
  const transaction = `84a0${witness}f6f4`;
  expect(decodeBlockResources(hexToBytes(`82${dijkstraHeader}8381${transaction}f6f6`))).toEqual({ bytes: 25, memory: 3n, steps: 4n, rankingBody: true });
});

it("reads an empty certified Dijkstra body without counting announced payloads as executed bytes", () => {
  expect(decodeBlockResources(hexToBytes(`82${dijkstraHeader}8380f6f6`))).toEqual({ bytes: 25, memory: 0n, steps: 0n, rankingBody: true });
});

it("includes Dijkstra subtransaction witness budgets", () => {
  const witness = "a105a18207008200820304";
  const sub = `83a0${witness}f6`;
  const transaction = `84a117d9010281${sub}${witness}f6f5`;
  expect(decodeBlockResources(hexToBytes(`82${dijkstraHeader}8381${transaction}f6f6`))).toEqual({ bytes: 25, memory: 6n, steps: 8n, rankingBody: true });
});

it("rejects truncated Dijkstra execution units", () => {
  expect(() => decodeBlockResources(hexToBytes(`82${dijkstraHeader}838184a0a105a182070082008203`))).toThrow();
});

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
