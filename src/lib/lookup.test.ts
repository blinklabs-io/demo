// @vitest-environment node
import { Core } from "@blaze-cardano/sdk";
import { describe, expect, it } from "vitest";
import { detectEntityKind } from "./lookup";

const mainAddress = Core.Address.fromBytes(Core.HexBlob("61" + "11".repeat(28))).toBech32();
const testAddress = Core.Address.fromBytes(Core.HexBlob("60" + "11".repeat(28))).toBech32();
const stakeAddress = Core.Address.fromBytes(Core.HexBlob("e1" + "11".repeat(28))).toBech32();
const byronAddress = "Ae2tdPwUPEYxWXqTgtb8eV8NAt1pW99Wq2FPAFfTQx3BWTiMqRh4erKMFJ3";

describe("detectEntityKind", () => {
  it("returns null for an empty or whitespace-only query", () => {
    expect(detectEntityKind("")).toBeNull();
    expect(detectEntityKind("   ")).toBeNull();
  });

  it("detects a mainnet and testnet address", () => {
    expect(detectEntityKind(mainAddress)).toEqual({
      kind: "address",
      route: `/explorer/address/${mainAddress}`,
    });
    expect(detectEntityKind(testAddress)).toEqual({
      kind: "address",
      route: `/explorer/address/${testAddress}`,
    });
  });

  it("detects a stake account", () => {
    expect(detectEntityKind(stakeAddress)).toEqual({
      kind: "account",
      route: `/explorer/account/${stakeAddress}`,
    });
  });

  it("detects a pool id", () => {
    expect(detectEntityKind("pool1xyexample")).toEqual({
      kind: "pool",
      route: "/explorer/pool/pool1xyexample",
    });
  });

  it("detects a DRep id, including drep_script", () => {
    expect(detectEntityKind("drep1xyexample")).toEqual({
      kind: "drep",
      route: "/explorer/drep/drep1xyexample",
    });
    expect(detectEntityKind("drep_script1xyexample")).toEqual({
      kind: "drep",
      route: "/explorer/drep/drep_script1xyexample",
    });
  });

  it("routes a 64-char hex string to the ambiguous tx/block resolver", () => {
    const hash = "a".repeat(64);
    expect(detectEntityKind(hash)).toEqual({
      kind: "tx",
      route: `/explorer/lookup/${hash}`,
    });
  });

  it("distinguishes a policy from an asset with a name", () => {
    const policyOnly = "b".repeat(56);
    expect(detectEntityKind(policyOnly)).toEqual({
      kind: "policy",
      route: `/explorer/policy/${policyOnly}`,
    });

    const withName = "b".repeat(56) + "cafe";
    expect(detectEntityKind(withName)).toEqual({
      kind: "asset",
      route: `/explorer/asset/${withName}`,
    });
  });

  it("detects a plain numeric string as a block height", () => {
    expect(detectEntityKind("123456")).toEqual({
      kind: "block",
      route: "/explorer/block/123456",
    });
  });

  it("returns null for gibberish it can't classify", () => {
    expect(detectEntityKind("not-a-real-identifier")).toBeNull();
  });

  it("trims surrounding whitespace before matching", () => {
    expect(detectEntityKind("  123456  ")).toEqual({
      kind: "block",
      route: "/explorer/block/123456",
    });
  });
});

describe("named explorer lookup", () => {
  it("finds pool tickers without changing numeric block lookup", () => {
    expect(detectEntityKind(" blink ")).toEqual({
      kind: "pool",
      route: "/explorer/pools?ticker=BLINK",
    });
    expect(detectEntityKind("pool:8964")).toEqual({
      kind: "pool",
      route: "/explorer/pools?ticker=8964",
    });
    expect(detectEntityKind("8964")).toEqual({
      kind: "block",
      route: "/explorer/block/8964",
    });
  });
  it("routes Handle and SubHandle searches to Dingo resolution", () => {
    expect(detectEntityKind("$Alice")).toEqual({
      kind: "handle",
      route: "/explorer/handle/alice",
    });
    expect(detectEntityKind("$alice@family")).toEqual({
      kind: "handle",
      route: "/explorer/handle/alice%40family",
    });
  });
});

describe("policy and native asset lookup", () => {
  const policy = "a".repeat(56);
  it("supports explicit policies and normalizes case", () => {
    expect(detectEntityKind(` policy:${policy.toUpperCase()} `)).toEqual({
      kind: "policy",
      route: `/explorer/policy/${policy}`,
    });
  });
  it("accepts dotted asset IDs including an empty asset name", () => {
    expect(detectEntityKind(`${policy.toUpperCase()}.CAFE`)).toEqual({
      kind: "asset",
      route: `/explorer/asset/${policy}cafe`,
    });
    expect(detectEntityKind(`${policy}.`)).toEqual({
      kind: "asset",
      route: `/explorer/asset/${policy}`,
    });
  });
  it("lets callers disambiguate a 64-character asset or an empty-name asset", () => {
    expect(detectEntityKind(`asset:${policy}deadbeef`)).toEqual({
      kind: "asset",
      route: `/explorer/asset/${policy}deadbeef`,
    });
    expect(detectEntityKind(`asset:${policy}`)).toEqual({
      kind: "asset",
      route: `/explorer/asset/${policy}`,
    });
    expect(detectEntityKind(`asset:${policy}.cafe`)).toEqual({
      kind: "asset",
      route: `/explorer/asset/${policy}cafe`,
    });
  });
  it("rejects odd-length and oversized asset names", () => {
    for (const value of [
      policy + "f",
      policy + "ff".repeat(33),
      `${policy}.f`,
      `asset:${policy}f`,
      `policy:${policy}ff`,
    ])
      expect(detectEntityKind(value)).toBeNull();
  });
});

it("recognizes a valid Byron address and normalizes uppercase bech32", () => {
  expect(detectEntityKind(byronAddress)).toEqual({kind: "address", route: `/explorer/address/${byronAddress}`});
  expect(detectEntityKind(testAddress.toUpperCase())).toEqual({kind: "address", route: `/explorer/address/${testAddress}`});
});
it("does not turn address-shaped asset hex into a payment address", () => {
  const asset = "60" + "11".repeat(27) + "ab";
  expect(detectEntityKind(asset)).toEqual({kind: "asset", route: `/explorer/asset/${asset}`});
  expect(detectEntityKind(testAddress.slice(0,-1) + "z")).toBeNull();
});
