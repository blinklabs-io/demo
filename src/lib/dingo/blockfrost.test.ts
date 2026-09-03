import { describe, expect, it, vi } from "vitest";
import { BlockfrostError, blockfrostFetch } from "./blockfrost";

function mockFetch(response: Partial<Response> & { ok: boolean }) {
  global.fetch = vi.fn().mockResolvedValue(response as Response);
}

describe("blockfrostFetch", () => {
  it("returns parsed JSON on a successful response", async () => {
    mockFetch({
      ok: true,
      json: async () => ({ is_healthy: true }),
    });

    const result = await blockfrostFetch<{ is_healthy: boolean }>("/health");
    expect(result).toEqual({ is_healthy: true });
  });

  it("throws a BlockfrostError with the status and path on a non-ok response", async () => {
    mockFetch({
      ok: false,
      status: 404,
      json: async () => ({ error: "Not Found" }),
    });

    await expect(blockfrostFetch("/api/v0/blocks/999")).rejects.toMatchObject({
      status: 404,
      path: "/api/v0/blocks/999",
    });
  });

  it("is a BlockfrostError instance so callers can distinguish it from other errors", async () => {
    mockFetch({ ok: false, status: 500, json: async () => ({}) });

    await expect(blockfrostFetch("/api/v0/network")).rejects.toBeInstanceOf(
      BlockfrostError,
    );
  });

  it("wraps a network failure (e.g. connection refused) in a BlockfrostError with status 0", async () => {
    global.fetch = vi.fn().mockRejectedValue(new TypeError("Failed to fetch"));

    const error = await blockfrostFetch("/health").catch((err) => err);
    expect(error).toBeInstanceOf(BlockfrostError);
    expect((error as BlockfrostError).status).toBe(0);
    expect((error as BlockfrostError).message).toMatch(/Could not reach Dingo/);
  });

  it("tolerates a non-JSON error body without throwing a secondary error", async () => {
    mockFetch({
      ok: false,
      status: 502,
      json: async () => {
        throw new SyntaxError("Unexpected token");
      },
    });

    await expect(blockfrostFetch("/health")).rejects.toMatchObject({
      status: 502,
    });
  });
});
