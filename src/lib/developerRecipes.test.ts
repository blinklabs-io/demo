// @vitest-environment node
import { DINGO_CONFIG } from "./dingo/config";
import { Core } from "@blaze-cardano/sdk";
import { expect, it, vi } from "vitest";
import { recipeExample, recipeSdkExample } from "./developerRecipes";

it("executes the copyable SDK decoder against the documented example", () => {
  const log = vi.fn(),
    dir = vi.fn();
  const example = recipeSdkExample("workbench")!;
  const execute = new Function(
    "Core",
    "console",
    example.replace('import { Core } from "@blaze-cardano/sdk";', ""),
  );
  execute(Core, { log, dir });
  expect(log).toHaveBeenCalledWith(
    "Data hash:",
    "abf1684c343b2004e7f40510a12c2428adfaedabad1c05cae9ff4c08ba82ae0a",
  );
  expect(dir).toHaveBeenCalledOnce();
});

it("executes read examples and preserves HTTP failures", async () => {
  const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;
  const execute = new AsyncFunction(
    "fetch",
    "console",
    recipeExample("tracker", "JavaScript"),
  );
  const fetch = vi.fn(
    async () => new Response(JSON.stringify({ hash: "11".repeat(32) })),
  );
  await execute(fetch, { log: vi.fn() });
  expect(fetch.mock.calls).toHaveLength(3);
  expect(fetch).toHaveBeenNthCalledWith(
    1,
    `${DINGO_CONFIG.blockfrostUrl}/api/v0/txs/TRANSACTION_ID`,
  );
  expect(fetch).toHaveBeenNthCalledWith(
    2,
    `${DINGO_CONFIG.blockfrostUrl}/api/v0/blocks/latest`,
  );
  expect(fetch).toHaveBeenNthCalledWith(
    3,
    `${DINGO_CONFIG.blockfrostUrl}/api/v0/blocks/BLOCK_HEIGHT`,
  );
  fetch.mockResolvedValueOnce(new Response("Unavailable", { status: 503 }));
  await expect(execute(fetch, { log: vi.fn() })).rejects.toThrow(
    "HTTP 503: Unavailable",
  );
});
