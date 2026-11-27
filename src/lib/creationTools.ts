import { nativeTicker } from "./format";

const definitions = [
  {
    id: "data",
    icon: "build",
    name: "Datum & redeemer workbench",
    description:
      "Decode Plutus CBOR and trace data to transaction inputs and scripts.",
  },
  {
    id: "transactions",
    icon: "swap",
    name: "Transaction studio",
    description:
      "Build unsigned payments, inspect CBOR, add witnesses, and export to cardano-cli.",
  },
  {
    id: "batch",
    icon: "send",
    name: "Batch payments",
    description: "Pay many recipients in a single transaction, by hand or from a CSV.",
  },
  {
    id: "utxos",
    icon: "grid",
    name: "UTxO workshop",
    description: "Merge many small outputs into one, or split one into several.",
  },
  {
    id: "proof",
    icon: "file",
    name: "Document proofs",
    description: "Publish a file's hash on chain as a timestamp, and verify it later.",
  },
  {
    id: "mint",
    icon: "token",
    name: "Token studio",
    description: "Mint and burn native assets with your own policy.",
  },
  {
    id: "drep",
    icon: "user",
    name: "DRep registration",
    description: "Register or renew your governance identity.",
  },
  {
    id: "treasury",
    icon: "treasury",
    name: "Treasury donation",
    description: `Donate test ${nativeTicker()} directly to the treasury.`,
  },
] as const;

export type CreationToolId = (typeof definitions)[number]["id"];
export const creationTools = definitions.map((tool) => ({
  ...tool,
  to: `/wallet/tools/${tool.id}`,
}));
