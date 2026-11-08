// @vitest-environment node
import { execFileSync } from "node:child_process";
import { DINGO_NETWORK } from "./dingo/config";
import { Core } from "@blaze-cardano/sdk";
import { expect, it, vi } from "vitest";
import { recipeExample, recipeSdkExample, OWN_DINGO_ENDPOINTS, selfHostedDemoExample } from "./developerRecipes";

vi.mock("./dingo/config", () => ({
  DINGO_NETWORK: { id: "mainnet", label: "Mainnet", networkMagic: 764824073 },
  DINGO_CONFIG: { blockfrostUrl: "https://demo-api.example", utxorpcUrl: "https://demo-rpc.example" },
}));

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
    `${OWN_DINGO_ENDPOINTS.blockfrostUrl}/api/v0/txs/TRANSACTION_ID`,
  );
  expect(fetch).toHaveBeenNthCalledWith(
    2,
    `${OWN_DINGO_ENDPOINTS.blockfrostUrl}/api/v0/blocks/latest`,
  );
  expect(fetch).toHaveBeenNthCalledWith(
    3,
    `${OWN_DINGO_ENDPOINTS.blockfrostUrl}/api/v0/blocks/BLOCK_HEIGHT`,
  );
  fetch.mockResolvedValueOnce(new Response("Unavailable", { status: 503 }));
  await expect(execute(fetch, { log: vi.fn() })).rejects.toThrow(
    "HTTP 503: Unavailable",
  );
});

it("configures the selected network's local demo endpoints", () => {
  expect(selfHostedDemoExample()).toContain("VITE_DINGO_MAINNET_BLOCKFROST_URL=http://127.0.0.1:3000");
  expect(selfHostedDemoExample()).toContain("VITE_DINGO_MAINNET_UTXORPC_URL=http://127.0.0.1:9090");
  expect(selfHostedDemoExample()).toContain("VITE_DINGO_MAINNET_MESH_URL=http://127.0.0.1:8080");
  expect(selfHostedDemoExample()).toContain("?network=mainnet");
});

it("connects copied Leios and mempool SDK examples to the reader's instance", async () => {
  const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;
  const clients: string[] = [];
  class CardanoSyncClient {
    constructor({ uri }: { uri: string }) { clients.push(uri); }
    async fetchBlock() { return { nativeBytes: new Uint8Array() }; }
  }
  class CardanoSubmitClient {
    constructor({ uri }: { uri: string }) { clients.push(uri); }
    inner = { readMempool: async () => ({ items: [] }) };
    async *watchMempool() { yield { nativeBytes: new Uint8Array() }; }
  }
  const fetch = vi.fn(async () => Response.json({ hash: "11".repeat(32), slot: 42 }));
  for (const recipe of ["leios", "mempool"] as const) {
    const code = recipeSdkExample(recipe)!.replace(/^import .*;\n/, "");
    await new AsyncFunction("CardanoSyncClient", "CardanoSubmitClient", "fetch", "console", code)(CardanoSyncClient, CardanoSubmitClient, fetch, { log: vi.fn() });
  }
  expect(clients).toEqual([OWN_DINGO_ENDPOINTS.utxorpcUrl, OWN_DINGO_ENDPOINTS.utxorpcUrl]);
  expect(fetch).toHaveBeenCalledWith(OWN_DINGO_ENDPOINTS.blockfrostUrl + "/api/v0/blocks/latest");
});

it.each([
  ["preview", ""], ["preprod", "PREPROD_"], ["mainnet", "MAINNET_"],
  ["musashi", "MUSASHI_"], ["dijkstra", "DIJKSTRA_"], ["prime-testnet", "PRIME_TESTNET_"],
])("uses the actual %s endpoint override names in runnable shell examples", (id, prefix) => {
  const previous = DINGO_NETWORK.id;
  try {
    Object.assign(DINGO_NETWORK, { id });
    const setup = selfHostedDemoExample();
    expect(setup).toContain(`VITE_DINGO_${prefix}BLOCKFROST_URL=http://127.0.0.1:3000`);
    expect(setup).toContain(`VITE_DINGO_${prefix}UTXORPC_URL=http://127.0.0.1:9090`);
    expect(setup).toContain(`VITE_DINGO_${prefix}MESH_URL=http://127.0.0.1:8080`);
    execFileSync("bash", ["-n", "-c", setup]);
    execFileSync("bash", ["-n", "-c", recipeExample("tracker", "cURL")]);
  } finally { Object.assign(DINGO_NETWORK, { id: previous }); }
});
