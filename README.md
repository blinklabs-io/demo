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
- Wallet balance, reward withdrawals, send, pool delegation, and SundaeSwap V3 Preview order flows
- DRep Yes, No, and Abstain votes from governance action pages, with fee review,
  CIP-95 wallet signing, and submission through Dingo
- Blockfrost-compatible GET console and read-only Mesh POST console
- Governance proposals with deposits, lifecycle epochs, action descriptions,
  and paginated votes showing whether each vote counts; constitutional committee
  membership, authorization status, expiration epochs, and quorum
- API console presets for governance proposals, committee votes, asset and script
  catalogs, Blockfrost mempool, latest-block transaction CBOR, and retired pools

## Visual exploration

Interactive views use the configured Dingo APIs and connected wallet data:

- A live block conveyor keeps pending observations separate from confirmed blocks.
- Transaction value flows account for fees, deposits, withdrawals, minting, and collateral through a shared value pool.
- Block mosaics size transactions by serialized bytes, with activity filters and on-demand bulk CBOR pages.
- Wallet UTxO constellations share selection with the consolidation form, with a complete checkbox list for larger wallets.
- Governance chambers show ballot counts separately for each voter role, rather than weighted voting power.
- Asset landscapes distinguish loaded holders from unmapped supply and show mint/burn events in event order.
- Stake journeys separate earned reward epochs, effective delegation epochs, and dated ledger milestones.
- Epoch fingerprints compare aggregate activity with independently normalized axes and exact values.

Large histories load bounded pages on request. Visuals expose exact records,
keyboard controls, mobile layouts, and reduced-motion support.

The explorer includes transaction and block-size charts, ADA supply breakdowns,
reward and holder charts, and timelines for eras, blocks, and governance actions.
Charts link to the underlying records and expose values on keyboard focus.
Pool identities use registered tickers and names with locally rendered initials.

Recent blocks and block details show the protocol version decoded from the
block header bytes returned by UTxO RPC. A minor version of 69 displays the
Dingo forging marker. Header versions are distinct from the current epoch's
protocol parameters.

Global search accepts registered pool tickers and `$handle` names. Numeric pool
tickers can be qualified as `pool:8964` to distinguish them from block heights.
Both legacy CIP-25 and CIP-68 `$handle` ownership are supported.
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
shows available staking rewards, delegation, and the delegated pool's owner record.
Reward withdrawals include an amount and fee review, explicit wallet signing,
submission through Dingo, and confirmation tracking. Shared
stake credentials do not establish control of the corresponding payment keys.
Other pool ownership checks and historical address-balance charts run only on
request. Balance history compares up to six completed epoch-end snapshots with
the current balance and uses calendar dates on its axis. Unretained epochs are
identified and omitted without inferring balances. Addresses are displayed in
full with copy controls. Wallets exposing CIP-95 can also show their DRep
registration.

The swap view identifies SundaeSwap V3 on Preview, the selected liquidity pool,
and the order contracts. Quotes show estimated and minimum received amounts,
slippage, price impact, and connected-wallet balances. The weekly price chart samples pool reserves every six hours using the pool
NFT’s transaction history and reserve outputs from Dingo, with a live price
point and an interactive crosshair. History is cached for six hours and repeated
samples reuse the same transaction output. These are reserve snapshots, not
trade candles. Submitting an order is
separate from its execution by a scooper.

## On-chain surveys

The Surveys section creates, discovers, answers, and cancels public CIP-179
version 5 surveys on Preview. It supports the six built-in question types and
keyholder credentials, with required-signer proof verified from transaction
CBOR. Results validate question constraints and the inclusive epoch cutoff,
keep the latest valid response per credential in chain order, and exclude all
responses to a verified creator cancellation. Display aggregation is stated
beside each result; it is not ADA weighting or a count of unique people.

The app includes a parser for the Cardano Foundation free-text schema from
[its canonical source](https://github.com/cardano-foundation/state-of-the-developer-ecosystem/blob/main/survey/cip179/free-text.schema.json).
The schema is pinned to its verified BLAKE2b-256 hash, which must match the survey's anchor before use. Other
custom schemas, sealed surveys, external presentation documents, and roles that
require historical ledger membership snapshots are not supported. Runtime
survey reads and transaction submission use only Dingo APIs.

Discovery pages through metadata label 17. Tallying filters those metadata
records by survey reference before reading matching transaction CBOR and
inclusion data, reuses immutable reads, and limits concurrent verifications.
Publishing, responding, and cancelling each require an explicit transaction
review and wallet signature; public metadata is permanent.

## Preview wallet tools

The wallet Tools section uses the connected CIP-30 wallet and existing Dingo
APIs. It includes:

- Batch ADA and native asset payments, with CSV recipient import and raw token
  quantities. Review shows the actual outputs, token-output ADA, change, and fee.
- Consolidation of selected wallet UTxOs, preserving native assets, and creation
  of equal ADA outputs. Consolidation excludes datum and reference-script
  outputs and does not spend other addresses merely sharing a stake key.
- SHA-256 document proofs in transaction metadata, with local file hashing and
  verification against confirmed transaction CBOR. Files are never uploaded;
  only the file name, digest, and message are published. A proof establishes the
  fingerprint's existence by the block timestamp, not authorship or ownership.
- Native token minting with CIP-25 metadata, inline SVG artwork, and a signature-and-expiry policy,
  plus burning using an exported policy. The policy is not a supply cap or a
  uniqueness guarantee. Minting and burning both stop when the policy expires.
- CIP-95 DRep registration with the current deposit read from Dingo, and an
  explicit activity update that clears the metadata anchor.
- Direct Preview treasury donations using the ledger transaction field.

Every transaction requires separate build/review and sign/submit actions. Drafts
expire after at most ten minutes, wallet changes invalidate signing, and required
payment and DRep witnesses are verified before submission through Dingo.

### Visual gallery

Illustrative data, captured at desktop and mobile widths.

| View               | Desktop                                                                     | Mobile                                                                    |
| ------------------ | --------------------------------------------------------------------------- | ------------------------------------------------------------------------- |
| Block conveyor     | [Desktop](docs/screenshots/conveyor1500.jpg)           | [Mobile](docs/screenshots/conveyor390.jpg)           |
| Transaction flow   | [Desktop](docs/screenshots/flow1500.jpg)                   | [Mobile](docs/screenshots/flow390.jpg)                   |
| Block mosaic       | [Desktop](docs/screenshots/mosaic1500.jpg)               | [Mobile](docs/screenshots/mosaic390.jpg)               |
| UTxO constellation | [Desktop](docs/screenshots/constellation1500.jpg) | [Mobile](docs/screenshots/constellation390.jpg) |
| Governance chamber | [Desktop](docs/screenshots/chamber1500.jpg)             | [Mobile](docs/screenshots/chamber390.jpg)             |
| Asset landscape    | [Desktop](docs/screenshots/asset1500.jpg)                 | [Mobile](docs/screenshots/asset390.jpg)                 |
| Stake journey      | [Desktop](docs/screenshots/stake1500.jpg)                 | [Mobile](docs/screenshots/stake390.jpg)                 |
| Epoch fingerprints | [Desktop](docs/screenshots/epoch1500.jpg)                 | [Mobile](docs/screenshots/epoch390.jpg)                 |
