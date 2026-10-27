# Dingo Demo

A browser demo for the Dingo v0.85.0 node APIs. It combines a chain explorer,
CIP-30 wallet flows, and read-only API consoles in one app.

## Run it

Start Dingo with API storage enabled and the Blockfrost-compatible, Mesh, and
UTxO RPC APIs selected. The default local endpoints are:

| API                        | Default URL             | Used for                                                                          |
| -------------------------- | ----------------------- | --------------------------------------------------------------------------------- |
| Blockfrost-compatible REST | `http://127.0.0.1:3000` | Explorer data, policies, health, network, pools, DReps, wallet accounts and UTxOs |
| Mesh / Rosetta             | `http://127.0.0.1:8080` | Historical address balances and read-only Rosetta API console                     |
| UTxO RPC                   | `http://127.0.0.1:9090` | Block headers, transaction building/submission, mempool and live tip              |

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
- Governance proposals with deposits, lifecycle epochs, action descriptions,
  and paginated votes showing whether each vote counts; constitutional committee
  membership, authorization status, expiration epochs, and quorum
- API console presets for governance proposals, committee votes, asset and script
  catalogs, Blockfrost mempool, latest-block transaction CBOR, and retired pools

## Visual exploration

The explorer includes transaction and block-size charts, ADA supply breakdowns,
reward and holder charts, and timelines for eras, blocks, and governance actions.
Charts link to the underlying records and expose values on keyboard focus.
Pool identities use registered tickers and names, with artwork from published
extended metadata when available.

Recent blocks and block details show the protocol version decoded from the
block header bytes returned by UTxO RPC. A minor version of 69 displays the
Dingo forging marker. Header versions are distinct from the current epoch's
protocol parameters.

Global search accepts registered pool tickers and `$handle` names. Numeric pool
tickers can be qualified as `pool:8964` to distinguish them from block heights.
Handle ownership, virtual-handle datums, and policy-registry data are resolved
through Dingo's Blockfrost-compatible API; no external Handle resolver is used.

Policy IDs open paginated asset catalogs. Asset searches accept concatenated
IDs, `policy.asset-name-hex`, and `asset:ID` to disambiguate transaction hashes
or an asset with an empty name. Policy assets can be filtered by name or ID
within the displayed page. Pool and DRep directories provide instant substring
filters over loaded directory records.

The recent header-version graph reuses decoded headers from the overview's
block list. It describes that recent window, rather than a daily network tally.

The wallet portfolio groups addresses and UTxOs by their stake credential and
shows staking rewards, delegation, and the delegated pool's owner record. Shared
stake credentials do not establish control of the corresponding payment keys.
Other pool ownership checks and historical address-balance charts run only on
request. Balance history compares six completed epoch-end snapshots with the
current balance and uses calendar dates on its axis. Wallets exposing CIP-95 can also show their DRep registration.

The swap view identifies SundaeSwap V3 on Preview, the selected liquidity pool,
and the order contracts. Quotes show estimated and minimum received amounts,
slippage, price impact, and connected-wallet balances. The price chart records
live reserve observations while the page is open. Submitting an order is
separate from its execution by a scooper.
