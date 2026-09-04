import { describe, expect, it } from "vitest";
import { detectEntityKind } from "./lookup";

describe("detectEntityKind", () => {
  it("returns null for an empty or whitespace-only query", () => {
    expect(detectEntityKind("")).toBeNull();
    expect(detectEntityKind("   ")).toBeNull();
  });

  it("detects a mainnet and testnet address", () => {
    expect(detectEntityKind("addr1qxyexampleaddress")).toEqual({
      kind: "address",
      route: "/explorer/address/addr1qxyexampleaddress",
    });
    expect(detectEntityKind("addr_test1qxyexampleaddress")).toEqual({
      kind: "address",
      route: "/explorer/address/addr_test1qxyexampleaddress",
    });
  });

  it("detects a stake account", () => {
    expect(detectEntityKind("stake1uxyexample")).toEqual({
      kind: "account",
      route: "/explorer/account/stake1uxyexample",
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

  it("detects an asset id (policy id plus optional asset name hex)", () => {
    const policyOnly = "b".repeat(56);
    expect(detectEntityKind(policyOnly)).toEqual({
      kind: "asset",
      route: `/explorer/asset/${policyOnly}`,
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
