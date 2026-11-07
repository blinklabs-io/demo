import { DINGO_CONFIG, DINGO_NETWORK } from "./dingo/config";

export const recipes = {
  tracker: {
    title: "Track a transaction",
    path: "/api/v0/txs/TRANSACTION_ID",
    source: "src/lib/explorer/transactionTracking.ts",
    context:
      "Poll indexed inclusion and the latest block. A 404 means no indexed inclusion; it does not prove rejection. Re-read inclusion after rollback.",
    extra: "/api/v0/blocks/latest",
  },
  workbench: {
    title: "Decode datums and redeemers",
    path: "/api/v0/txs/TRANSACTION_ID/cbor",
    source: "src/lib/explorer/plutusWorkbench.ts",
    context:
      "Read the complete transaction, verify its ID, then inspect output datums, witness datums and redeemer data with @blaze-cardano/sdk.",
    extra: "/api/v0/txs/TRANSACTION_ID/utxos",
  },
  transactions: {
    title: "Build and inspect transactions",
    path: "/api/v0/epochs/latest/parameters",
    source: "src/lib/transactions/studio.ts",
    context:
      "The browser builds with Blaze. UTxO RPC resolves funds and verifies genesis. CIP-30 adds wallet witnesses; the studio exports without submitting.",
    extra: "/api/v0/blocks/latest",
  },
  tools: {
    title: "Build wallet tools",
    path: "/api/v0/epochs/latest/parameters",
    source: "src/lib/tools/transactions.ts",
    context:
      "Use Blaze with Dingo's provider for inputs and parameters. Wallet signing uses CIP-30; submission uses UTxO RPC. Review the implementation for each action's construction and network checks.",
    extra: "/api/v0/blocks/latest",
  },
  proof: {
    title: "Timestamp a document",
    path: "/api/v0/txs/TRANSACTION_ID/metadata",
    source: "src/lib/tools/proofs.ts",
    context:
      "Hash the file locally with Web Crypto. Only the proof metadata is put on chain; verification compares the local digest with indexed transaction metadata.",
  },
  participation: {
    title: "Read governance and participation",
    path: "/api/v0/governance/proposals?page=1&count=20&order=desc",
    source: "src/pages/Participate.tsx",
    context:
      "Read governance actions through Blockfrost. CIP-179 surveys and CIP-204 holder answers are built and signed in the browser; see the source for metadata and eligibility rules.",
  },
  markets: {
    title: "Build on-chain market experiences",
    path: "/api/v0/epochs/latest/parameters",
    source: "src/pages/Markets.tsx",
    context:
      "Market state is read from script UTxOs through UTxO RPC. Each integration constructs its protocol's datum and transaction, then requests wallet signing. These parameter reads are one prerequisite; the source contains the full flow.",
  },
  swap: {
    title: "Build a swap",
    path: "/api/v0/epochs/latest/parameters",
    source: "src/pages/wallet/WalletSwap.tsx",
    context:
      "The SundaeSwap integration reads protocol UTxOs through Dingo, builds an order, requests CIP-30 signing, and submits via UTxO RPC. Consult the source for the supported network and protocol version.",
  },
  mempool: {
    title: "Follow the live mempool",
    path: "/api/v0/mempool?page=1&count=20&order=desc",
    source: "src/lib/dingo/utxorpc/streaming.ts",
    context:
      "The live view uses UTxO RPC watchMempool plus periodic readMempool snapshots. Watch reports arrivals; snapshots reconcile removals. The REST request below reads a point-in-time view.",
  },
  network: {
    title: "Read network instruments",
    path: "/api/v0/network",
    source: "src/pages/explorer/NetworkDetail.tsx",
    context:
      "Combine supply and stake records with genesis, era timing, and the latest block to build network instruments.",
    extra: "/api/v0/blocks/latest",
  },
  explorer: {
    title: "Explore the chain",
    path: "/api/v0/blocks/latest",
    source: "src/pages/explorer/ExplorerOverview.tsx",
    context:
      "Read indexed blocks and transactions with Blockfrost. UTxO RPC followTip drives live updates; reconnects and rollbacks invalidate mutable cached records.",
  },
} as const;

export type BuildRecipe = keyof typeof recipes;

export function recipeSdkExample(recipe: BuildRecipe): string | null {
  if (recipe === "workbench")
    return `import { Core } from "@blaze-cardano/sdk";

// Paste a datum or redeemer's data CBOR, not the enclosing transaction.
const cbor = "d8799f182a4568656c6c6fff";
const reader = new Core.CborReader(Core.HexBlob(cbor));
reader.readEncodedValue();
if (reader.getBytesRemaining()) throw new Error("Trailing CBOR bytes");
const data = Core.PlutusData.fromCbor(Core.HexBlob(cbor));
console.log("Data hash:", data.hash());
console.dir(data.toCore(), { depth: null });
// toCore() retains bigint values. Use a bigint-aware JSON serializer.
// The linked implementation adds display limits and transaction context.`;
  if (recipe === "mempool")
    return `import { CardanoSubmitClient } from "@utxorpc/sdk";

const client = new CardanoSubmitClient({
  uri: ${JSON.stringify(DINGO_CONFIG.utxorpcUrl)}
});
const snapshot = await client.inner.readMempool({});
console.log(snapshot.items);
for await (const arrival of client.watchMempool()) {
  console.log(arrival.nativeBytes);
}
// Watch reports arrivals. Re-read snapshots to reconcile removals.
// Stop the iterator when your view closes; see the linked implementation.`;
  return null;
}

export function recipeExample(
  recipe: BuildRecipe,
  language: "JavaScript" | "cURL",
) {
  const definition = recipes[recipe];
  const paths: string[] = [definition.path];
  if ("extra" in definition) paths.push(definition.extra);
  if (language === "cURL")
    return paths
      .map(
        (path) =>
          `curl --fail-with-body '${(DINGO_CONFIG.blockfrostUrl + path).replaceAll("'", "'\\''")}'`,
      )
      .join("\n\n");
  const urls = paths
    .map((path) => JSON.stringify(`${DINGO_CONFIG.blockfrostUrl}${path}`))
    .join(",\n  ");
  return `// ${DINGO_NETWORK.label}${paths.some((p) => p.includes("TRANSACTION_ID")) ? " · replace TRANSACTION_ID with a transaction hash" : ""}\nconst urls = [\n  ${urls}\n];\nfor (const url of urls) {\n  const response = await fetch(url);\n  if (!response.ok) {\n    throw new Error(\`HTTP \${response.status}: \${await response.text()}\`);\n  }\n  console.log(await response.json());\n}`;
}
