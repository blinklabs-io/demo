import { walletScriptIdentity } from "../../lib/dingo/ownedScriptOutputs";
import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { DINGO_NETWORK } from "../../lib/dingo/config";
import { indigoPoint, indigoReward, INDY } from "../../lib/indigo/data";
import { readIndigoManager, readIndigoPosition, readIndigoPositions } from "../../lib/indigo/read";
import { prepareIndigoAction, submitIndigoAction, type IndigoAction } from "../../lib/indigo/transactions";
import { useWalletStore } from "../../stores/walletStore";
import { useTipStore } from "../../stores/tipStore";
import { Link } from "../NetworkLink";
import { MarketTransaction, MarketConfirmation } from "./MarketTransaction";
import { MarketLoading } from "./assets";
import { marketAmount,rawAmount } from "./amounts";
import "./markets.css";
const indy=(amount:bigint)=>{const value=amount<0n?-amount:amount;const fraction=(value%1000000n).toString().padStart(6,"0").replace(/0+$/,"").padEnd(2,"0");return `${amount<0n?"-":""}${(value/1000000n).toLocaleString()}.${fraction} INDY`;};
export function IndigoMarket(){return DINGO_NETWORK.id==="mainnet"?<IndigoMainnet/>:<section className="market-hero"><h1>Indigo on Mainnet</h1><Link to="/wallet/indigo?network=mainnet">Open Mainnet staking →</Link></section>;}
function IndigoMainnet(){
 const wallet=useWalletStore(),client=useQueryClient(),[hash,submitted]=useState("");
 const [mode,setMode]=useState<"stake"|"add"|"withdraw"|"claim"|"close">("stake"),[quantity,setQuantity]=useState("100"),[lookup,setLookup]=useState(""),[chosen,setChosen]=useState(""),[cursors,setCursors]=useState([""]),[page,setPage]=useState(0),[account,setAccount]=useState(wallet.changeAddress);
 if(account!==wallet.changeAddress){setAccount(wallet.changeAddress);setCursors([""]);setPage(0);setChosen("");}
 useEffect(()=>useTipStore.subscribe((next,previous)=>{if(next.revision!==previous.revision&&next.lastAction!=="apply"){setCursors([""]);setPage(0);setChosen("");}}),[]);
 const manager=useQuery({queryKey:["dingo","markets","indigo","manager"],queryFn:({signal})=>readIndigoManager(signal),staleTime:30000,refetchInterval:30000,retry:false});
 const catalog=useQuery({queryKey:["dingo","markets","indigo","account",wallet.changeAddress,cursors[page]],queryFn:async({signal})=>{if(!wallet.walletApi)throw new Error("Connect a wallet.");return readIndigoPositions((await walletScriptIdentity(wallet.walletApi,wallet.changeAddress!)).keys,cursors[page],signal);},enabled:wallet.status==="connected"&&!!wallet.changeAddress,staleTime:30000,refetchInterval:30000,retry:false});
 const positions=catalog.data?.positions??[],point=chosen||(positions[0]?indigoPoint(positions[0]):""),listed=positions.find(p=>indigoPoint(p)===point);
 const selected=useQuery({queryKey:["dingo","markets","indigo","selected",point],queryFn:({signal})=>readIndigoPosition(point,signal),enabled:!!point&&!listed,staleTime:30000,refetchInterval:30000,retry:false});
 const position=listed??selected.data;let action:IndigoAction|undefined,error="",reward:bigint|undefined;
 try{
   if(manager.data&&position)reward=indigoReward(manager.data,position);
   if(mode==="stake"||mode==="add"||mode==="withdraw"){if(!/^\d{1,18}(?:\.\d{1,6})?$/.test(quantity.trim()))throw new Error("Enter INDY with at most six decimal places.");const amount=rawAmount(quantity,"lovelace");if(amount<=0n)throw new Error("Enter a positive INDY amount.");if(mode==="stake")action={kind:"stake",amount};else if(position)action={kind:"adjust",point:indigoPoint(position),amount:mode==="withdraw"?-amount:amount};}
   else if(position)action=mode==="close"?{kind:"close",point:indigoPoint(position)}:{kind:"adjust",point:indigoPoint(position),amount:0n};
 }catch(e){error=e instanceof Error?e.message:"Enter a valid staking amount.";}
 const refresh=async()=>{await client.invalidateQueries({queryKey:["dingo","markets","indigo","account",wallet.changeAddress],refetchType:"none"});setCursors([""]);setPage(0);setChosen("");if(page===0)void catalog.refetch();void manager.refetch();};
 return <div className="markets-page"><header className="market-hero"><div><span className="eyebrow">Indigo V3 · Mainnet</span><h1>Stake INDY.<br/>Claim ADA rewards.</h1><p>Open an INDY staking position, adjust your stake, and collect protocol ADA rewards through Dingo.</p><a href="https://app.indigoprotocol.io/" target="_blank" rel="noopener noreferrer">Official Indigo ↗</a></div></header>
 <MarketConfirmation tracking={{hash,submitted}}/><nav className="market-mode" aria-label="Indigo action">{([['stake','Stake INDY'],['add','Add stake'],['withdraw','Withdraw stake'],['claim','Claim rewards'],['close','Close position']]as const).map(([value,label])=><button key={value} aria-pressed={mode===value} onClick={()=>setMode(value)}>{label}</button>)}</nav>
 <div className="market-layout"><section className="market-catalog"><div className="market-toolbar"><h2>Wallet positions</h2><button onClick={()=>void refresh()}>Refresh ↻</button></div>
 {wallet.status!=="connected"?<p>Connect a wallet to find positions controlled by its payment keys, or inspect a position by output reference.</p>:!catalog.data&&(catalog.isPending||catalog.error)?<MarketLoading error={catalog.error} retry={()=>void catalog.refetch()}/>:<>
 {catalog.error&&<p role="alert">Refresh failed: {catalog.error.message}</p>}<div className="market-grid">{positions.map(p=><button className={`market-card${indigoPoint(p)===point?" selected":""}`} key={indigoPoint(p)} onClick={()=>{setChosen(indigoPoint(p));setMode("claim");}}><strong>{indy(p.amount)}</strong><small>Staking position</small></button>)}</div>{!positions.length&&<p>No wallet-owned positions on this page.</p>}
 {!!catalog.data?.errors.length&&<details><summary>{catalog.data.errors.length} unsupported outputs</summary>{catalog.data.errors.map((e,i)=><p key={i}>{e}</p>)}</details>}
 <div className="market-actions"><button disabled={!page} onClick={()=>{setPage(page-1);setChosen("");}}>Previous positions</button><span>Page {page+1}</span><button disabled={!catalog.data?.nextToken} onClick={()=>{const next=catalog.data?.nextToken;if(next){setCursors([...cursors.slice(0,page+1),next]);setPage(page+1);setChosen("");}}}>Next positions</button></div></>}
 <form className="market-form" onSubmit={e=>{e.preventDefault();setChosen(lookup.trim().toLowerCase());setMode("claim");}}><label>Position output reference<input required pattern="[a-fA-F0-9]{64}#[0-9]+" placeholder="Transaction hash#output index" value={lookup} onChange={e=>setLookup(e.target.value)}/></label><button type="submit">Load position</button></form><p>Each page reads at most 20 outputs at Indigo’s shared staking address. Continue through pages or load a known position directly.</p></section>
 <section className="market-form"><h2>{mode==="stake"?"Open a staking position":"Manage your stake"}</h2>
 {manager.data?<p>{indy(manager.data.total)} staked across Indigo.</p>:<MarketLoading error={manager.error} retry={()=>void manager.refetch()}/>}
 {mode!=="stake"&&<>{selected.isFetching&&!position&&<MarketLoading retry={()=>void selected.refetch()}/>} {selected.error&&!listed&&<p role="alert">{selected.error.message}</p>}{position?<div className="market-quote"><small>Current stake</small><strong>{indy(position.amount)}</strong>{reward!==undefined&&<p>{marketAmount(reward,"lovelace")} rewards available.</p>}<p>{marketAmount(position.utxo.output().amount().coin(),"lovelace")} held with the position, returned when closed.</p>{position.locks.length>0&&<p>Governance votes may lock part of this stake until their voting periods end. Transaction review checks the current chain time.</p>}<Link to={`/explorer/tx/${position.utxo.input().transactionId()}`}>Inspect position transaction ↗</Link></div>:<p>Select a position or load its output reference.</p>}</>}
 {(mode==="stake"||mode==="add"||mode==="withdraw")&&<label>INDY amount<input inputMode="decimal" value={quantity} onChange={e=>setQuantity(e.target.value)}/></label>}
 {mode==="stake"&&<p>INDY uses six decimal places. A new position also holds 2 ADA, returned when you close it.</p>}
 {mode==="claim"&&<p>Claim available ADA rewards while keeping your INDY staked. The transaction fee is paid from your wallet.</p>}
 {mode==="close"&&<p>Return all INDY, the position’s ADA, and earned rewards to your wallet. Active governance locks must expire first.</p>}
 {(mode==="add"||mode==="withdraw")&&<p>Changing your stake also claims earned ADA rewards. Withdrawals must leave a positive position; use Close position to withdraw everything.</p>}
 {error&&<p role="alert">{error}</p>}
 <MarketTransaction draftKey={JSON.stringify([mode,action],(_,v)=>typeof v==="bigint"?String(v):v)} title="Review Indigo transaction" tracking={{hash,submitted}} ready={!!action&&!error&&!!manager.data&&!manager.error} prepare={(api,guard)=>{if(!action)throw new Error("Choose a staking action.");return prepareIndigoAction(api,action,guard);}} submit={(draft,api,guard)=>submitIndigoAction(api,draft,guard)} review={draft=><div className="market-quote"><p>Stake change: {indy(draft.amount)}</p><p>ADA rewards claimed: {marketAmount(draft.reward,"lovelace")}</p><p>All wallet change and rewards return to your connected wallet.</p></div>}/>
 <p>Only INDY staking is supported here. <a href={`https://cardanoscan.io/token/${INDY}`} target="_blank" rel="noopener noreferrer">Inspect INDY ↗</a></p>
 </section></div></div>;
}
