const definitions = [
  {
    id: "data",
    icon: "⌘",
    name: "Datum & redeemer workbench",
    description:
      "Decode Plutus CBOR and trace data to transaction inputs and scripts.",
    color: "violet",
  },
  {
    id: "transactions",
    icon: "⌁",
    name: "Transaction studio",
    description:
      "Build unsigned payments, inspect CBOR, add witnesses, and export to cardano-cli.",
    color: "teal",
  },
  {
    id: "batch",
    icon: "↗",
    name: "Batch payments",
    description: "Many recipients. One transaction.",
    color: "teal",
  },
  {
    id: "utxos",
    icon: "◫",
    name: "UTxO workshop",
    description: "Consolidate your wallet. Split spending outputs.",
    color: "violet",
  },
  {
    id: "proof",
    icon: "⌁",
    name: "Document proofs",
    description: "Hash locally. Timestamp on chain. Verify later.",
    color: "amber",
  },
  {
    id: "mint",
    icon: "✦",
    name: "Token studio",
    description: "Mint and burn native assets with your own policy.",
    color: "teal",
  },
  {
    id: "drep",
    icon: "♧",
    name: "DRep registration",
    description: "Register or renew your governance identity.",
    color: "violet",
  },
  {
    id: "treasury",
    icon: "◎",
    name: "Treasury donation",
    description: "Donate test ADA directly to the treasury.",
    color: "amber",
  },
] as const;

export type CreationToolId = (typeof definitions)[number]["id"];
export const creationTools = definitions.map((tool) => ({
  ...tool,
  to: `/wallet/tools/${tool.id}`,
}));
