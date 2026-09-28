# Dingo Demo

A browser demo for the current Dingo node APIs. It combines a chain explorer,
CIP-30 wallet flows, and read-only API consoles in one app.

## Run it

Start Dingo with API storage enabled and the Blockfrost-compatible, Mesh, and
UTxO RPC APIs selected. The default local endpoints are:

| API | Default URL | Used for |
| --- | --- | --- |
| Blockfrost-compatible REST | `http://127.0.0.1:3000` | Explorer data, health, network, metadata, pools, DReps, accounts |
| Mesh / Rosetta | `http://127.0.0.1:8080` | Read-only Rosetta API console |
| UTxO RPC | `http://127.0.0.1:9090` | Wallet balance, transaction building/submission, mempool and live tip |

Then run:

```sh
npm install
npm run dev
```

Set these Vite variables at build or dev-server startup to use other Dingo
endpoints:

```sh
VITE_DINGO_BLOCKFROST_URL=https://blockfrost.example \
VITE_DINGO_MESH_URL=https://mesh.example \
VITE_DINGO_UTXORPC_URL=https://utxorpc.example \
npm run dev
```

The URLs must point to the API roots (without a trailing slash). Configure
Dingo’s CORS allowlist for the exact browser origin when the site and node use
different origins. The explorer’s index-dependent pages need Dingo `api`
storage mode. Wallet send and swap pages submit transactions to the selected
node, so use a test network and connect a test wallet.

## Included views

- Explorer overview with recent blocks, block activity, epoch progress, supply
  and stake, and a protocol snapshot
- Network supply, genesis settings, and era timing
- Blocks, transactions, addresses, stake accounts, assets, epochs, stake pools,
  DReps, mempool, and numeric transaction metadata labels (`metadata:123`);
  historical protocol parameters are searchable as `epoch:123`
- Transaction CBOR and metadata, UTxO datum/reference-script details,
  certificate records, redeemers, treasury donations, and required signers
- CIP-119 DRep names and anchor links, plus active, retired, and expired DRep
  filters
- Wallet balance, send, pool delegation, and SundaeSwap V3 Preview order flows
- Blockfrost-compatible GET console and read-only Mesh POST console
