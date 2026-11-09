import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { DINGO_NETWORK } from "../../lib/dingo/config";
import { fluidPlan, fluidPoint, FLUID_POOL_POLICY, type FluidTerms } from "../../lib/fluidtokens/data";
import { readFluidPool, readFluidPools, fluidCancellationKeys } from "../../lib/fluidtokens/read";
import { prepareFluidAction, submitFluidAction, type FluidAction } from "../../lib/fluidtokens/transactions";
import { useWalletStore } from "../../stores/walletStore";
import { useTipStore } from "../../stores/tipStore";
import { Link } from "../NetworkLink";
import { MarketTransaction, MarketConfirmation } from "./MarketTransaction";
import { MarketAsset, MarketLoading } from "./assets";
import { marketAmount, marketAssetName, rawAmount } from "./amounts";
import "./markets.css";
const amount = (value: bigint, unit: string) => marketAmount(value, unit) + (unit === "lovelace" ? "" : " base units");
export function FluidTokensMarket() {
  return DINGO_NETWORK.id === "mainnet" ? <FluidMainnet /> : <section className="market-hero"><h1>FluidTokens on Mainnet</h1><Link to="/wallet/fluidtokens?network=mainnet">Open Mainnet lending →</Link></section>;
}
function FluidMainnet() {
  const wallet = useWalletStore(), [hash, submitted] = useState("");
  const tracking = { hash, submitted };
  const [mode, setMode] = useState<"create" | "cancel">("create"), [principal, setPrincipal] = useState("lovelace"), [collateral, setCollateral] = useState("");
  const [deposit, setDeposit] = useState("100"), [collateralAmount, setCollateralAmount] = useState(""), [ratioPrincipal, setRatioPrincipal] = useState("1");
  const [interest, setInterest] = useState("10"), [hours, setHours] = useState("720"), [windowHours, setWindowHours] = useState("24"), [funding, setFunding] = useState("3");
  const [lookup, setLookup] = useState(""), [chosen, setChosen] = useState(""), [cursors, setCursors] = useState([""]), [page, setPage] = useState(0);
  const [account, setAccount] = useState(wallet.changeAddress);
  if (account !== wallet.changeAddress) { setAccount(wallet.changeAddress); setCursors([""]); setPage(0); setChosen(""); }
  useEffect(() => useTipStore.subscribe((next, previous) => { if (next.revision !== previous.revision && next.lastAction !== "apply") { setCursors([""]); setPage(0); setChosen(""); } }), []);
  const catalog = useQuery({ queryKey: ["dingo", "markets", "fluidtokens", "account", wallet.changeAddress, cursors[page]], queryFn: async ({ signal }) => { if (!wallet.walletApi) throw new Error("Connect a wallet to read its pool keys."); return readFluidPools(wallet.changeAddress!, await fluidCancellationKeys(wallet.walletApi), cursors[page], signal); }, enabled: wallet.status === "connected" && !!wallet.changeAddress, staleTime: 30000, refetchInterval: 30000, retry: false });
  const pools = catalog.data?.pools ?? [], point = chosen || (pools[0] ? fluidPoint(pools[0]) : ""), listed = pools.find(pool => fluidPoint(pool) === point);
  const selection = useQuery({ queryKey: ["dingo", "markets", "fluidtokens", "selected", point], queryFn: ({ signal }) => readFluidPool(point, signal), enabled: !!point && !listed, staleTime: 30000, refetchInterval: 30000, retry: false });
  const pool = listed ?? selection.data;
  let terms: FluidTerms | undefined, action: FluidAction | undefined, plan: ReturnType<typeof fluidPlan> | undefined, error = "";
  if (mode === "create") try {
    if (!/^\d{1,3}(?:\.\d{1,2})?$/.test(interest) || !/^\d{1,4}$/.test(hours) || !/^\d{1,4}$/.test(windowHours)) throw new Error("Enter loan interest with at most two decimal places and whole hours.");
    const [whole, fraction = ""] = interest.split(".");
    terms = { principal: principal.trim(), collateral: collateral.trim(), amount: rawAmount(deposit, principal.trim()), collateralAmount: rawAmount(collateralAmount, collateral.trim()), principalRatio: rawAmount(ratioPrincipal, principal.trim()), interest: BigInt(whole) * 100n + BigInt(fraction.padEnd(2,"0")), hours: Number(hours), repaymentWindow: Number(windowHours), extraAda: principal.trim() === "lovelace" ? 0n : rawAmount(funding,"lovelace") };
    plan = fluidPlan(terms); action = { kind: "create", terms };
  } catch (cause) { error = cause instanceof Error ? cause.message : "Check the lending terms."; }
  else if (pool) { if (pool.authTag === 0n) action = { kind: "cancel", outpoint: fluidPoint(pool) }; else error = "This pool requires script authorization for cancellation. Use the official FluidTokens workspace to manage it."; }
  const queryError = listed ? catalog.error : selection.error;
  return <div className="markets-page">
    <MarketConfirmation tracking={tracking} />
    <header className="market-hero"><div><span className="eyebrow">FluidTokens V4 · Mainnet</span><h1>Set your lending terms.</h1><p>Create a static lending pool with explicit collateral quantities and fixed loan interest. Manage the remaining liquidity with your wallet; Dingo reads, evaluates, and submits transactions.</p><a href="https://app.fluidtokens.com/ada/markets" target="_blank" rel="noreferrer">Official FluidTokens ↗</a></div></header>
    <nav className="market-mode" aria-label="FluidTokens action"><button aria-pressed={mode === "create"} onClick={() => setMode("create")}>Create a lending pool</button><button aria-pressed={mode === "cancel"} onClick={() => setMode("cancel")}>Manage pools</button></nav>
    <div className="market-layout">
      <section className="market-catalog"><div className="market-toolbar"><h2>Wallet pools</h2><button disabled={!wallet.changeAddress} onClick={() => void catalog.refetch()}>Refresh ↻</button></div>
        {wallet.status !== "connected" ? <p>Connect a wallet to find pools controlled by its payment keys, or inspect a pool by output reference.</p> : !catalog.data && (catalog.isPending || catalog.error) ? <MarketLoading error={catalog.error} retry={() => void catalog.refetch()} /> : <>
          {catalog.error && <p role="alert">Refresh failed: {catalog.error.message}</p>}
          <div className="market-grid">{pools.map(candidate => <button className={`market-card${fluidPoint(candidate) === point ? " selected" : ""}`} key={fluidPoint(candidate)} onClick={() => { setChosen(fluidPoint(candidate)); setMode("cancel"); }}><MarketAsset unit={candidate.principal} /><strong>{amount(candidate.available,candidate.principal)} remaining</strong></button>)}</div>
          {!pools.length && <p>No wallet-controlled pools on this page.</p>}
          {!!catalog.data?.errors.length && <details><summary>{catalog.data.errors.length} unsupported outputs</summary>{catalog.data.errors.map((message,index) => <p key={index}>{message}</p>)}</details>}
          <div className="market-actions"><button disabled={!page} onClick={() => { setPage(page-1); setChosen(""); }}>Previous pools</button><span>Page {page+1}</span><button disabled={!catalog.data?.nextToken} onClick={() => { const next = catalog.data?.nextToken; if (next) { const cached = cursors.indexOf(next); if (cached >= 0) setPage(cached); else { setCursors([...cursors.slice(0,page+1),next]); setPage(page+1); } setChosen(""); } }}>Next pools</button></div>
        </>}
        <form className="market-form" onSubmit={event => { event.preventDefault(); setChosen(lookup.trim().toLowerCase()); setMode("cancel"); }}><label>Pool output reference<input required pattern="[a-fA-F0-9]{64}#[0-9]+" placeholder="Transaction hash#output index" value={lookup} onChange={event => setLookup(event.target.value)} /></label><button type="submit">Load pool</button></form><p>Each page reads at most 20 outputs at the wallet’s complete pool address and filters by its known cancellation keys.</p>
      </section>
      <section className="market-form">
        {mode === "create" ? <>
          <h2>Create a static lending pool</h2>
          <datalist id="fluid-wallet-assets"><option value="lovelace">ADA</option>{wallet.tokens.map(token => <option key={token.assetId} value={token.assetId}>{marketAssetName(token.assetId)}</option>)}</datalist>
          <label>Principal asset<input list="fluid-wallet-assets" value={principal} onChange={event => { setPrincipal(event.target.value); setDeposit(""); setRatioPrincipal(""); }} /></label><label>Amount to lend<input inputMode="decimal" value={deposit} onChange={event => setDeposit(event.target.value)} /></label>
          <label>Collateral asset<input list="fluid-wallet-assets" placeholder="lovelace or policy ID + hexadecimal asset name" value={collateral} onChange={event => { setCollateral(event.target.value); setCollateralAmount(""); }} /></label>
          <fieldset><legend>Fixed collateral ratio</legend><label>Collateral quantity required<input inputMode="decimal" value={collateralAmount} onChange={event => setCollateralAmount(event.target.value)} /></label><label>For each principal quantity<input inputMode="decimal" value={ratioPrincipal} onChange={event => setRatioPrincipal(event.target.value)} /></label></fieldset>
          <label>Total loan interest (%)<input inputMode="decimal" value={interest} onChange={event => setInterest(event.target.value)} /></label><label>Repayment due after (hours)<input inputMode="numeric" value={hours} onChange={event => setHours(event.target.value)} /></label><label>Additional repayment window (hours)<input inputMode="numeric" value={windowHours} onChange={event => setWindowHours(event.target.value)} /></label>
          {principal.trim() !== "lovelace" && <label>ADA funding for the pool<input inputMode="decimal" value={funding} onChange={event => setFunding(event.target.value)} /></label>}
          <p>ADA uses six decimal places; native tokens use whole base units. Interest applies once to each loan, with one repayment. The collateral ratio stays fixed and uses no price feed.</p>
          {plan && terms && <div className="market-quote"><small>Lending terms</small><strong>{amount(terms.amount,terms.principal)}</strong><p>{amount(terms.collateralAmount,terms.collateral)} collateral for each {amount(terms.principalRatio,terms.principal)} principal.</p><p>{interest}% loan interest · due after {hours} hours · {windowHours} more hours to repay.</p><p>Total ADA deposited: {amount(plan.coin,"lovelace")}</p></div>}
          <p>After the repayment window, unpaid loans allow the lender to claim the full collateral. Loans are represented by bond tokens sent to the lender’s committed wallet address. Remaining pool liquidity can be cancelled separately from outstanding loans.</p>
        </> : <><h2>Inspect and cancel remaining liquidity</h2>{selection.isFetching && !pool && <MarketLoading retry={() => void selection.refetch()} />}{queryError && <p role="alert">{queryError.message}</p>}
          {pool ? <><MarketAsset unit={pool.principal} /><p>{amount(pool.available,pool.principal)} principal remains in this pool.</p><div className="market-quote"><small>{pool.authTag === 0n ? "Value returned on cancellation" : "Current pool value"}</small><p>{amount(pool.utxo.output().amount().coin(),"lovelace")}</p>{[...(pool.utxo.output().amount().multiasset() ?? [])].filter(([unit]) => unit !== FLUID_POOL_POLICY+pool.name).map(([unit,quantity]) => <p key={unit}>{amount(quantity,unit)} · <MarketAsset unit={unit} /></p>)}</div>{pool.authTag === 0n && <p>Cancel the remaining pool liquidity to the connected wallet. The pool identifier is burned. Existing loans and their bonds stay active.</p>}<Link to={`/explorer/tx/${pool.utxo.input().transactionId()}`}>Inspect pool transaction ↗</Link></> : <p>Select a wallet pool or load its output reference.</p>}
        </>}
        {error && <p role="alert">{error}</p>}
        <MarketTransaction draftKey={JSON.stringify([mode,action],(_,value) => typeof value === "bigint" ? String(value) : value)} title="Review FluidTokens transaction" tracking={tracking} ready={!!action && !error && (mode === "create" || !queryError)} prepare={(api,guard) => { if (!action) throw new Error("Enter valid lending terms."); return prepareFluidAction(api,action,guard); }} submit={(draft,api,guard) => submitFluidAction(api,draft,guard)} />
      </section>
    </div>
  </div>;
}
