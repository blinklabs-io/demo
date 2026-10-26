import { describe, expect, it } from "vitest";
import { eraNameFromProtocol, networkName } from "./networkNames";

describe("network names", () => {
  it.each([
    [764824073, "Mainnet"],
    [1, "Preprod"],
    [2, "Preview"],
    [42, "Custom network"],
  ])("names network magic %s", (magic, name) =>
    expect(networkName(Number(magic))).toBe(name),
  );
});
describe("era names from protocol versions", () => {
  it.each([
    [0, "Byron"],
    [1, "Byron"],
    [2, "Shelley"],
    [3, "Allegra"],
    [4, "Mary"],
    [5, "Alonzo"],
    [6, "Alonzo"],
    [7, "Babbage"],
    [8, "Babbage"],
    [9, "Conway"],
    [10, "Conway"],
    [11, "Conway"],
    [12, "Dijkstra"],
    [13, "Dijkstra"],
  ])("names protocol version %s", (version, name) =>
    expect(eraNameFromProtocol(Number(version))).toBe(name),
  );
  it("does not guess for unknown or invalid protocol versions", () => {
    for (const version of [-1, 1.5, 14, NaN])
      expect(eraNameFromProtocol(version)).toBe("Unknown era");
  });
});
