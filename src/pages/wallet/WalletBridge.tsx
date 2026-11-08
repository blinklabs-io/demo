import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useSearchParams } from "react-router";
import { Link } from "../../components/NetworkLink";
import { MarketConfirmation, MarketTransaction } from "../../components/markets/MarketTransaction";
import { DINGO_NETWORK } from "../../lib/dingo/config";
import { formatNativeCoin } from "../../lib/format";
import { readBridgeSettings, readBridgeTransfer, REACTOR_DOCS, type Destination } from "../../lib/reactor/api";
import { prepareBridgeTransaction, submitBridgeTransaction } from "../../lib/reactor/transactions";
import "./bridge.css";

const chainName = (chain: Destination) => chain === "vector" ? "Vector" : "Nexus";
const stages = [
  ["DiscoveredOnSource", "Seen on Prime"], ["SubmittedToBridge", "Witnessed by Reactor"],
  ["IncludedInBatch", "Included in a batch"], ["SubmittedToDestination", "Sent to destination"],
  ["ExecutedOnDestination", "Delivered"],
] as const;
export default function WalletBridge() {
  if (DINGO_NETWORK.id !== "prime-testnet") return <section className="market-hero">
    <div><span className="eyebrow">Reactor · Apex Fusion</span><h1>Bridge from Prime Testnet.</h1>
      <p>Move test AP3X from Prime to Vector or Nexus. Open Prime Testnet to build and sign a transfer.</p>
      <Link className="experience-primary" to="/wallet/bridge?network=prime-testnet">Open Prime bridge →</Link>
    </div>
  </section>;
  return <BridgeWorkspace />;
}
function BridgeWorkspace() {
  const settings = useQuery({ queryKey: ["reactor", "prime-testnet", "settings"], queryFn: ({ signal }) => readBridgeSettings(signal), retry: false, refetchInterval: 60_000 });
  const [destination, setDestination] = useState<Destination>("vector");
  const [address, setAddress] = useState("");
  const [amount, setAmount] = useState("");
  const [params, setParams] = useSearchParams();
  const hash = (params.get("hash") ?? "").trim().toLowerCase();
  const [lookup, setLookup] = useState(hash);
  const [lookupHash, setLookupHash] = useState(hash);
  if (lookupHash !== hash) { setLookupHash(hash); setLookup(hash); }
  const [lookupError, setLookupError] = useState("");
  const validHash = /^[a-f0-9]{64}$/.test(hash);
  const tracking = { hash: validHash ? hash : "", submitted: (value: string) => { setLookup(value); setParams({ network: "prime-testnet", hash: value }); } };
  const transfer = useQuery({ queryKey: ["reactor", "prime-testnet", "transfer", hash], enabled: validHash, queryFn: ({ signal }) => readBridgeTransfer(hash, signal), retry: false,
    // A refund can still await delivery; its status determines completion.
    refetchInterval: (query) => query.state.error || query.state.data?.status === "ExecutedOnDestination" || query.state.data?.status === "InvalidRequest" ? false : 10_000,
  });
  const available = !!settings.data && !settings.isError && !settings.data.paused && settings.data.destinations.includes(destination);
  const progress = stages.findIndex(([status]) => status === transfer.data?.status);
  return <div className="markets-page bridge-page">
    <section className="market-hero"><div><span className="eyebrow">Prime Testnet · Reactor Bridge</span><h1>Move AP3X.<br /><em>Across the fusion.</em></h1>
      <p>Build a Prime transaction here. Your wallet signs, Dingo submits, and Reactor delivers to Vector or Nexus Testnet.</p>
      <a href={REACTOR_DOCS} target="_blank" rel="noopener noreferrer">How Reactor works ↗</a>
    </div></section>
    <div className="bridge-flow" role="img" aria-label={`Prime Testnet through Reactor to ${chainName(destination)} Testnet`}>
      <div><span>P</span><strong>Prime</strong><small>Testnet · AP3X</small></div><i aria-hidden="true">→</i>
      <div><span>⇄</span><strong>Reactor</strong><small>Witness · Batch · Deliver</small></div><i aria-hidden="true">→</i>
      <div><span>{destination === "vector" ? "V" : "N"}</span><strong>{chainName(destination)}</strong><small>Testnet · AP3X</small></div>
    </div>
    <section className="bridge-settings" aria-label="Reactor availability">
      <h2>Live bridge conditions</h2>
      {settings.isPending ? <p role="status">Reading Reactor’s routes and fees…</p> : settings.isError ? <p role="alert">Could not read Reactor’s routes and fees. Building is unavailable.</p> : settings.data && <>
        <p role="status">{settings.data.paused ? "Validator change in progress · transfers paused" : settings.data.destinations.length ? "Prime routes available" : "Prime routes are currently unavailable"}</p>
        <dl><div><dt>Bridge fee</dt><dd>{formatNativeCoin(settings.data.fee)}</dd></div><div><dt>Minimum amount</dt><dd>{formatNativeCoin(settings.data.minimum)}</dd></div><div><dt>Maximum amount</dt><dd>{settings.data.maximum ? formatNativeCoin(settings.data.maximum) : "No configured maximum"}</dd></div></dl>
      </>}
      <button type="button" disabled={settings.isFetching} onClick={() => void settings.refetch()}>Refresh bridge conditions</button>
    </section>
    <section className="bridge-compose"><h2>Bridge from Prime</h2>
      <div className="bridge-fields"><label>Destination network<select aria-label="Destination network" value={destination} onChange={(event) => setDestination(event.target.value as Destination)}>
        <option value="vector">Vector Testnet</option><option value="nexus">Nexus Testnet</option>
      </select></label><label>Amount to bridge · AP3X<input aria-label="Amount to bridge" inputMode="decimal" value={amount} onChange={(event) => setAmount(event.target.value)} placeholder="10" /></label></div>
      {settings.data && !settings.isError && !settings.data.paused && !settings.data.destinations.includes(destination) && <p role="status">{chainName(destination)} transfers are unavailable. Choose an available route.</p>}
      <label>Destination address on {chainName(destination)} Testnet<input aria-label="Bridge destination address" value={address} onChange={(event) => setAddress(event.target.value)} placeholder={destination === "vector" ? "addr1…" : "0x…"} spellCheck={false} /></label>
      <p>The bridge fee is added to this amount. The Prime network fee is shown in transaction review. {destination === "vector" ? "Vector Testnet uses addr1 payment addresses." : "Use a Nexus Testnet EVM address."}</p>
      <MarketTransaction title="Review your bridge transfer" draftKey={JSON.stringify([destination, address, amount, settings.data?.fee.toString(), settings.data?.paused])} ready={available && !!address.trim() && !!amount.trim()} tracking={tracking}
        reviewDetails={(draft) => <div className="bridge-review">
          <h4>{chainName(draft.action.destination)} Testnet destination</h4><code className="bridge-hash">{draft.action.address}</code>
          <dl><div><dt>Amount to bridge</dt><dd>{formatNativeCoin(draft.amount)}</dd></div><div><dt>Reviewed bridge fee</dt><dd>{formatNativeCoin(draft.bridgeFee)}</dd></div><div><dt>Prime lock output</dt><dd>{formatNativeCoin(draft.amount + draft.bridgeFee)}</dd></div></dl>
        </div>}
        prepare={(api, guard) => prepareBridgeTransaction(api, { destination, address, amount }, guard)} submit={submitBridgeTransaction} />
    </section>
    <section className="bridge-tracking"><h2>Follow a Prime transfer</h2>
      <form onSubmit={(event) => { event.preventDefault(); const value = lookup.trim().toLowerCase(); if (!/^[a-f0-9]{64}$/.test(value)) { setLookupError("Enter a 64-character Prime transaction hash."); return; } setLookupError(""); setParams({ network: "prime-testnet", hash: value }); }}>
        <label>Prime transaction hash<input aria-label="Prime transaction hash" value={lookup} onChange={(event) => setLookup(event.target.value)} spellCheck={false} /></label><button type="submit">Track transfer</button>
      </form>
      {(lookupError || (hash && !validHash)) && <p role="alert">{lookupError || "Enter a 64-character Prime transaction hash."}</p>}
      {validHash && <>
        <MarketConfirmation tracking={tracking} resetLabel="New transfer" />
        {transfer.isPending ? <p role="status">Reading Reactor transfer progress…</p> : transfer.isError ? <p role="alert">Could not read Reactor transfer progress.</p> : transfer.data === null ? <p role="status">Reactor has not indexed this Prime transaction yet. Prime confirmation and bridge delivery are separate steps.</p> : transfer.data && <>
          <p role="status">{transfer.data.isRefund ? "Refund recorded by Reactor" : transfer.data.status === "ExecutedOnDestination" ? `Delivered on ${chainName(transfer.data.destination)} Testnet` : transfer.data.status === "InvalidRequest" ? "Reactor rejected this bridge request" : transfer.data.status === "FailedToExecuteOnDestination" ? "Destination execution failed" : stages.find(([status]) => status === transfer.data?.status)?.[1] ?? transfer.data.status}</p>
          {!transfer.data.isRefund && <ol className="bridge-stages">{stages.map(([status, label], index) => <li key={status} className={progress >= index ? "complete" : ""} aria-current={progress === index ? "step" : undefined}>{label}</li>)}</ol>}
          {transfer.data.destinationHash && <p>Destination transaction <code className="bridge-hash">{transfer.data.destinationHash}</code></p>}
        </>}
        <button type="button" disabled={transfer.isFetching} onClick={() => void transfer.refetch()}>Refresh transfer status</button>
      </>}
      {hash && !validHash && <button type="button" onClick={() => { setLookup(""); setLookupError(""); setParams({ network: "prime-testnet" }); }}>New transfer</button>}
    </section>
  </div>;
}
