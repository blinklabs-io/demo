import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { DINGO_NETWORK } from "../../lib/dingo/config";
import { splashPlan, splashPoint, type SplashTerms } from "../../lib/splash/data";
import { readSplashOrder, readSplashOrders } from "../../lib/splash/read";
import { prepareSplashAction, submitSplashAction, type SplashAction } from "../../lib/splash/transactions";
import { useWalletStore } from "../../stores/walletStore";
import { useTipStore } from "../../stores/tipStore";
import { MarketTransaction, MarketConfirmation } from "./MarketTransaction";
import { MarketAsset, MarketLoading } from "./assets";
import { marketAmount, marketAssetName, rawAmount } from "./amounts";
import { Link } from "../NetworkLink";
import { CopyButton } from "../explorer/CopyButton";
import "./markets.css";

const amount = (value: bigint, asset: string) => marketAmount(value, asset) + (asset === "lovelace" ? "" : " base units");
export function SplashMarket() {
  return DINGO_NETWORK.id === "mainnet" ? <SplashMainnet /> : <section className="market-hero"><div><h1>Splash on Mainnet</h1><Link to="/wallet/splash?network=mainnet">Open Mainnet orders →</Link></div></section>;
}
function SplashMainnet() {
  const wallet = useWalletStore(), [hash, submitted] = useState("");
  const tracking = { hash, submitted };
  const [mode, setMode] = useState<"create" | "cancel">("create");
  const [input, setInput] = useState("lovelace"), [output, setOutput] = useState("");
  const [offered, setOffered] = useState("10"), [minimum, setMinimum] = useState("");
  const [stepCost, setStepCost] = useState("1"), [steps, setSteps] = useState("4");
  const [executorFee, setExecutorFee] = useState("2"), [reserve, setReserve] = useState("2");
  const [lookup, setLookup] = useState(""), [chosen, setChosen] = useState("");
  const [cursors, setCursors] = useState([""]), [page, setPage] = useState(0);
  const [account, setAccount] = useState(wallet.changeAddress);
  if (account !== wallet.changeAddress) { setAccount(wallet.changeAddress); setCursors([""]); setPage(0); setChosen(""); }
  useEffect(() => useTipStore.subscribe((next, previous) => {
    if (next.revision !== previous.revision && next.lastAction !== "apply") { setCursors([""]); setPage(0); setChosen(""); }
  }), []);
  const catalog = useQuery({ queryKey: ["dingo", "markets", "splash", "account", wallet.changeAddress, cursors[page]], queryFn: ({ signal }) => readSplashOrders(wallet.changeAddress!, cursors[page], signal), enabled: wallet.status === "connected" && !!wallet.changeAddress, staleTime: 30000, refetchInterval: 30000, retry: false });
  const orders = catalog.data?.orders ?? [], point = chosen || (orders[0] ? splashPoint(orders[0]) : "");
  const listed = orders.find((order) => splashPoint(order) === point);
  const selection = useQuery({ queryKey: ["dingo", "markets", "splash", "selected", point], queryFn: ({ signal }) => readSplashOrder(point, signal), enabled: !!point && !listed, staleTime: 30000, refetchInterval: 30000, retry: false });
  const order = listed ?? selection.data;
  let terms: SplashTerms | undefined, plan: ReturnType<typeof splashPlan> | undefined, action: SplashAction | undefined, error = "";
  if (mode === "create") {
    try {
      if (!/^\d{1,2}$/.test(steps)) throw new Error("Choose between one and sixteen execution steps.");
      terms = { input: input.trim(), output: output.trim(), amount: rawAmount(offered, input.trim()), minimum: rawAmount(minimum, output.trim()), stepCost: rawAmount(stepCost, "lovelace"), steps: Number(steps), executorFee: rawAmount(executorFee, "lovelace"), extraAda: rawAmount(reserve, "lovelace") };
      plan = splashPlan(terms); action = { kind: "create", terms };
    } catch (cause) { error = cause instanceof Error ? cause.message : "Check the order terms."; }
  } else if (order) action = { kind: "cancel", outpoint: splashPoint(order) };
  const queryError = listed ? catalog.error : selection.error;
  const ready = !!action && !error && (mode === "create" || !queryError);
  return <div className="markets-page">
    <MarketConfirmation tracking={tracking} />
    <section className="market-hero"><div><span className="eyebrow">Splash · Cardano Mainnet</span><h1>Set a limit.<br /><em>Keep your terms.</em></h1><p>Create an order with your own minimum price and execution budget. Inspect its on-chain progress or cancel the remaining order. Your wallet signs; Dingo handles chain data and submission.</p><div className="market-source"><a href="https://splash.trade/" target="_blank" rel="noreferrer">Official Splash ↗</a><span>Direct Dingo integration</span></div></div></section>
    <nav className="market-mode" aria-label="Splash action"><button aria-pressed={mode === "create"} onClick={() => setMode("create")}>Place a limit order</button><button aria-pressed={mode === "cancel"} onClick={() => setMode("cancel")}>Manage orders</button></nav>
    <div className="market-layout">
      <section className="market-catalog">
        <div className="market-toolbar"><h2>Account orders</h2><button disabled={!wallet.changeAddress} onClick={() => void catalog.refetch()}>Refresh ↻</button></div>
        {wallet.status !== "connected" ? <p>Connect a wallet to read orders at its Splash account address, or load an order by output reference.</p> : !catalog.data && (catalog.isPending || catalog.error) ? <MarketLoading error={catalog.error} retry={() => void catalog.refetch()} /> : <>
          {catalog.error && <p role="alert">Refresh failed: {catalog.error.message}</p>}
          <div className="market-grid">{orders.map((candidate) => <button className={`market-card${splashPoint(candidate) === point ? " selected" : ""}`} aria-pressed={splashPoint(candidate) === point} key={splashPoint(candidate)} onClick={() => { setChosen(splashPoint(candidate)); setMode("cancel"); }}><span className="market-pair"><MarketAsset unit={candidate.input} /> → <MarketAsset unit={candidate.output} /></span><strong>{amount(candidate.amount, candidate.input)} remaining</strong><small>Execution fee remaining: {amount(candidate.fee, "lovelace")}</small></button>)}</div>
          {!orders.length && <p>No decoded orders on this page.</p>}
          {!!catalog.data?.errors.length && <details><summary>{catalog.data.errors.length} unsupported outputs</summary>{catalog.data.errors.map((message, index) => <p key={index}>{message}</p>)}</details>}
          <div className="market-actions"><button disabled={!page} onClick={() => { setPage(page - 1); setChosen(""); }}>Previous orders</button><span>Page {page + 1}</span><button disabled={!catalog.data?.nextToken} onClick={() => { const next = catalog.data?.nextToken; if (next) { const existing = cursors.indexOf(next); if (existing >= 0) setPage(existing); else { setCursors([...cursors.slice(0, page + 1), next]); setPage(page + 1); } setChosen(""); } }}>Next orders</button></div>
        </>}
        <form className="market-form" onSubmit={(event) => { event.preventDefault(); setChosen(lookup.trim().toLowerCase()); setMode("cancel"); }}><label>Order output reference<input required pattern="[a-fA-F0-9]{64}#[0-9]+" placeholder="Transaction hash#output index" value={lookup} onChange={(event) => setLookup(event.target.value)} /></label><button type="submit">Load order</button></form>
        <p>Each account page reads at most 20 outputs at the account’s complete script address. Output-reference lookup can load an order using another stake address.</p>
      </section>
      <section className="market-form">
        {mode === "create" ? <>
          <h2>Place a limit order</h2>
          <datalist id="splash-wallet-assets"><option value="lovelace">ADA</option>{wallet.tokens.map((token) => <option key={token.assetId} value={token.assetId}>{marketAssetName(token.assetId)}</option>)}</datalist>
          <label>Input asset<input list="splash-wallet-assets" value={input} onChange={(event) => setInput(event.target.value)} /></label>
          <label>Amount to sell<input inputMode="decimal" value={offered} onChange={(event) => setOffered(event.target.value)} /></label>
          <label>Output asset<input list="splash-wallet-assets" placeholder="lovelace or policy ID + hexadecimal asset name" value={output} onChange={(event) => setOutput(event.target.value)} /></label>
          <label>Minimum to receive<input inputMode="decimal" value={minimum} onChange={(event) => setMinimum(event.target.value)} /></label>
          <p>ADA uses six decimal places; native tokens use whole base units. Every execution must respect your minimum output/input rate.</p>
          <fieldset><legend>Execution budget</legend><label>ADA per execution step<input inputMode="decimal" value={stepCost} onChange={(event) => setStepCost(event.target.value)} /></label><label>Target execution steps<input inputMode="numeric" value={steps} onChange={(event) => setSteps(event.target.value)} /></label><label>Total executor fee (ADA)<input inputMode="decimal" value={executorFee} onChange={(event) => setExecutorFee(event.target.value)} /></label><label>Additional ADA funding<input inputMode="decimal" value={reserve} onChange={(event) => setReserve(event.target.value)} /></label></fieldset>
          {plan && terms && <div className="market-quote"><small>Limit terms</small><strong>{amount(terms.amount, terms.input)} → at least {amount(terms.minimum, terms.output)}</strong><p>Execution steps: {amount(plan.budget, "lovelace")} · executor fee: {amount(terms.executorFee, "lovelace")} · additional funding: {amount(terms.extraAda, "lovelace")}</p><p>Total ADA in the order: {amount(plan.coin, "lovelace")}</p></div>}
          <p>Execution and settlement draw from the funded ADA. Cancellation returns the complete remaining value. Execution depends on liquidity and an executor accepting the funded fees.</p>
        </> : <>
          <h2>Inspect and cancel</h2>
          {selection.isFetching && !order && <MarketLoading retry={() => void selection.refetch()} />}
          {queryError && <p role="alert">{queryError.message}</p>}
          {order ? <><span className="market-pair"><MarketAsset unit={order.input} /> → <MarketAsset unit={order.output} /></span><p>{amount(order.amount, order.input)} remaining at a minimum rate of {order.numerator.toString()}/{order.denominator.toString()} output/input base units.</p><p>Executor fee remaining: {amount(order.fee, "lovelace")}</p><div className="market-actions"><Link to={`/explorer/tx/${order.utxo.input().transactionId()}`}>Inspect transaction ↗</Link><CopyButton value={splashPoint(order)} label="order output reference" /></div><p>Cancellation returns the complete current order value to its committed recipient:</p><p style={{ overflowWrap: "anywhere" }}>{order.owner.toBech32()}</p></> : <p>Choose an account order or load its output reference.</p>}
        </>}
        {error && <p role="alert">{error}</p>}
        <MarketTransaction draftKey={JSON.stringify([mode, action], (_, value) => typeof value === "bigint" ? String(value) : value)} ready={ready} title="Review Splash transaction" tracking={tracking} prepare={(api, guard) => { if (!action) throw new Error("Enter valid Splash order terms."); return prepareSplashAction(api, action, guard); }} submit={(draft, api, guard) => submitSplashAction(api, draft, guard)} />
      </section>
    </div>
  </div>;
}
