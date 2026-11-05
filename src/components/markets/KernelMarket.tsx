import { readDingoChainTime } from "../../lib/dingo/chainTime";
import { loanCollateralChoices } from "../../lib/kernel/lifecycle";
import { assetUnit, type KernelAsset } from "../../lib/kernel/actions";
import {
  kernelMinimumDeposits,
  needsKernelDeposits,
  readKernelOutputParameters,
} from "./kernelDeposits";
import { useTipStore } from "../../stores/tipStore";
import { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { Core } from "@blaze-cardano/sdk";
import { useWalletStore } from "../../stores/walletStore";
import { type KernelRecord, loadKernelRequest } from "../../lib/kernel/markets";
import { KERNEL_LANES, type KernelLane } from "../../lib/kernel/protocol";
import { canCloseKernelRecord } from "../../lib/kernel/close";
import {
  prepareKernelTransaction,
  submitKernelTransaction,
  type KernelAction,
} from "../../lib/kernel/transactions";
import { quoteKernelSwap } from "../../lib/kernel/swap";
import {
  MarketTransaction,
  MarketConfirmation,
  type MarketTracking,
} from "./MarketTransaction";
import {
  kernelPageQuery,
  useKernelSelection,
  type KernelSelection,
} from "./kernelQuery";
import { KernelCreate } from "./KernelCreate";
import { MarketAsset, MarketLoading } from "./assets";
import { marketAmount, marketAssetName, rawAmount } from "./amounts";
import {
  kernelAsset,
  kernelExpiry,
  kernelInteger,
  kernelPrice,
  kernelRatio,
  kernelSwapAssets,
  kernelTerms,
  percentRatio,
} from "./kernelView";
import { Link } from "../NetworkLink";
import { CopyButton } from "../explorer/CopyButton";
import "./markets.css";

type Family = "lending" | "options" | "orders" | "marketplace";
const lanes: Record<Family, { lane: KernelLane; label: string }[]> = {
  lending: [
    { lane: "loan-negotiation", label: "Requests & offers" },
    { lane: "loan-active", label: "Active loans" },
  ],
  options: [
    { lane: "option-proposals", label: "Proposals" },
    { lane: "option-active", label: "Active contracts" },
  ],
  orders: [
    { lane: "one-way", label: "One-way orders" },
    { lane: "two-way", label: "Two-way markets" },
  ],
  marketplace: [{ lane: "aftermarket", label: "Listings & bids" }],
};
function recordTitle(record: KernelRecord) {
  const f = record.fields;
  if (record.lane === "one-way" || record.lane === "two-way") {
    const assets = kernelSwapAssets(record);
    return (
      <span className="market-pair">
        {assets.offer && <MarketAsset unit={assets.offer} />} →{" "}
        {assets.ask && <MarketAsset unit={assets.ask} />}
      </span>
    );
  }
  const unit = kernelAsset(f.loan_asset ?? f.offer_asset);
  if (unit) return <MarketAsset unit={unit} />;
  const policy = typeof f.nft_policy_id === "string" ? f.nft_policy_id : "";
  const name =
    Array.isArray(f.nft_names) && typeof f.nft_names[0] === "string"
      ? f.nft_names[0]
      : "";
  return policy ? (
    <MarketAsset unit={policy + name} />
  ) : (
    <span>Financial position</span>
  );
}
function recordTerms(record: KernelRecord, termIndex = 0) {
  const f = record.fields,
    amount = kernelInteger(f.loan_principal ?? f.offer_quantity),
    asset = kernelAsset(f.loan_asset ?? f.offer_asset);
  const interest = percentRatio(f.loan_interest),
    term = kernelInteger(f.loan_term);
  const terms = kernelTerms(record)[termIndex],
    expiry = kernelExpiry(
      f.expiration ??
        terms?.expiration ??
        f.loan_expiration ??
        f.claim_expiration,
    );
  const price = kernelPrice(f.sale_price ?? f.bid ?? f.starting_price);
  const rate = kernelRatio(
    f.swap_price ?? f.asset1_price ?? f.strike_price ?? terms?.strike_price,
  );
  return (
    <div className="market-terms">
      {amount !== null && asset && (
        <div>
          <small>
            {f.loan_principal !== undefined ? "Principal" : "Offered assets"}
          </small>
          <strong>{marketAmount(amount, asset)}</strong>
        </div>
      )}
      {term !== null && (
        <div>
          <small>Loan term</small>
          <strong>{Number(term / 86400000n)} days</strong>
        </div>
      )}
      {interest !== null && (
        <div>
          <small>Contract interest</small>
          <strong>{interest}%</strong>
        </div>
      )}
      {rate && (
        <div>
          <small>
            {record.lane === "one-way" || record.lane === "two-way"
              ? "Price · requested / offered"
              : "Strike · ask / offer"}
          </small>
          <strong>
            {Number(rate.numerator) / Number(rate.denominator)} base units
          </strong>
        </div>
      )}
      {price.map((p, i) => (
        <div key={i}>
          <small>{record.kind.includes("Bid") ? "Bid" : "Asking price"}</small>
          <strong>{marketAmount(p.quantity, p.unit)}</strong>
        </div>
      ))}
      {expiry !== null && (
        <div>
          <small>{expiry < Date.now() ? "Expired" : "Expires"}</small>
          <strong>{new Date(expiry).toLocaleString()}</strong>
        </div>
      )}
      <div>
        <small>ADA in contract</small>
        <strong>{marketAmount(record.lovelace, "lovelace")}</strong>
      </div>
    </div>
  );
}
function marketDiagram(family: Family, selected?: KernelRecord) {
  const terms = selected ? kernelTerms(selected)[0] : undefined;
  const strike = kernelRatio(
    terms?.strike_price ?? selected?.fields.strike_price,
  );
  if (family === "options" && strike)
    return (
      <figure className="market-illustration">
        <svg
          viewBox="0 0 420 240"
          role="img"
          aria-label="Option intrinsic exercise value before premium: zero below strike and increasing above strike"
        >
          <line className="chart-grid" x1="35" x2="390" y1="190" y2="190" />
          <line className="chart-grid" x1="212" x2="212" y1="20" y2="200" />
          <path className="chart-area" d="M35 190 L212 190 L390 35 L390 190Z" />
          <path className="chart-line" d="M35 190 H212 L390 35" />
          <text x="35" y="220">
            0
          </text>
          <text x="212" y="220" textAnchor="middle">
            Strike {Number(strike.numerator) / Number(strike.denominator)}
          </text>
          <text x="350" y="220">
            2× strike
          </text>
          <text x="35" y="20">
            Exercise value in ask asset
          </text>
        </svg>
        <figcaption>
          Intrinsic value before premium · price axis uses base-unit ratios
        </figcaption>
      </figure>
    );
  const labels =
    family === "lending"
      ? ["Request", "Offer", "Accept", "Repay"]
      : family === "options"
        ? ["Write", "Buy", "Exercise", "Settle"]
        : family === "orders"
          ? ["Publish", "Discover", "Fill", "Compose"]
          : ["List", "Discover", "Buy", "Own"];
  return (
    <figure className="market-illustration">
      <svg
        viewBox="0 0 420 220"
        role="img"
        aria-label={`${labels.join(" → ")}: direct on-chain workflow`}
      >
        <path
          d="M55 65 C140 20 285 20 365 65 M365 65 C405 130 310 180 215 155 M215 155 C100 190 15 140 55 65"
          fill="none"
          stroke="#5edcc44a"
          strokeWidth="2"
          strokeDasharray="5 7"
        />
        {labels.map((label, i) => {
          const [x, y] = [
            [55, 65],
            [215, 40],
            [365, 65],
            [215, 155],
          ][i];
          return (
            <g key={label}>
              <circle
                cx={x}
                cy={y}
                r="29"
                fill={i % 2 ? "#4e3569" : "#1c5c56"}
                stroke={i % 2 ? "#ae94e8" : "#66e3c3"}
              />
              <text
                x={x}
                y={y + 5}
                textAnchor="middle"
                style={{ fontSize: 19, fill: "#d6fff4" }}
              >
                {i + 1}
              </text>
              <text x={x} y={y + 49} textAnchor="middle">
                {label}
              </text>
            </g>
          );
        })}
      </svg>
      <figcaption>
        One chain · existing contracts · your wallet signs
      </figcaption>
    </figure>
  );
}
function SelectedAction({
  selection,
  tracking,
}: {
  tracking: MarketTracking;
  selection: KernelSelection;
}) {
  const { record, records } = useKernelSelection(selection);
  const [swapTopUp, setSwapTopUp] = useState("0");
  const chainClock = useQuery({
    queryKey: ["dingo", "markets", "kernel", "chain-clock"],
    queryFn: ({ signal }) => readDingoChainTime(signal),
    staleTime: 30000,
    refetchInterval: 30000,
    retry: false,
  });
  const now = chainClock.data;
  const [collateralSelection, setCollateralSelection] = useState({
    ask: "",
    unit: "",
  });
  const [requestInput, setRequestInput] = useState(""),
    [requestRef, setRequestRef] = useState("");
  const importedRequest = useQuery({
    queryKey: ["dingo", "markets", "kernel", "request", requestRef],
    enabled: !!requestRef,
    queryFn: ({ signal }) => loadKernelRequest(requestRef, signal),
    retry: false,
    staleTime: 0,
  });
  const [loanMode, setLoanMode] = useState<"repay" | "accrue" | "claim">(
      "repay",
    ),
    [periods, setPeriods] = useState("1"),
    [claimant, setClaimant] = useState<"borrower" | "lender">("borrower");
  const wallet = useWalletStore(),
    [amount, setAmount] = useState("1"),
    [side, setSide] = useState<1 | 2>(1),
    [term, setTerm] = useState(0),
    [askId, setAskId] = useState("");
  const outputParameters = useQuery({
    queryKey: ["dingo", "markets", "kernel", "output-parameters"],
    queryFn: ({ signal }) => readKernelOutputParameters(signal),
    staleTime: 300000,
    refetchInterval: 300000,
    retry: false,
  });
  if (!record) return null;
  let action: KernelAction | null = null,
    error = "",
    description = "";
  let stakeHash = "";
  try {
    stakeHash = wallet.rewardAddress
      ? String(
          Core.Address.fromBech32(wallet.rewardAddress)
            .asReward()!
            .getPaymentCredential().hash,
        )
      : "";
  } catch {
    /* No stake signer is available. */
  }
  const closable = canCloseKernelRecord(record, stakeHash),
    f = record.fields;
  const swap = record.lane === "one-way" || record.lane === "two-way";
  const terms = kernelTerms(record),
    selectedTerms = terms[term],
    expiry = kernelExpiry(selectedTerms?.expiration ?? f.expiration);
  const expired = expiry !== null && now !== undefined && expiry <= now;
  let collateralChoices: KernelAsset[] = [],
    collateralChoice = "";
  let quote: ReturnType<typeof quoteKernelSwap> | undefined;
  let depositPreview: ReturnType<typeof kernelMinimumDeposits> | undefined;
  try {
    if (!swap) {
      if (chainClock.error) throw chainClock.error;
      if (now === undefined)
        throw new Error("Reading current chain time from Dingo…");
    }
    const deposit = 0n;
    if (swap) {
      const units = kernelSwapAssets(record, side);
      quote = quoteKernelSwap(
        record,
        rawAmount(amount, units.offer ?? ""),
        side,
        rawAmount(swapTopUp, "lovelace"),
      );
      action = {
        kind: "swap",
        record,
        take: quote.take,
        side,
        extraAda: quote.extraAda,
      };
      description = `Pay ${marketAmount(quote.paid, quote.ask.policyId + quote.ask.name || "lovelace")}${quote.ask.policyId && quote.extraAda > 0n ? ` + ${marketAmount(quote.extraAda, "lovelace")} added to the continuing order` : ""} · receive ${marketAmount(quote.take, quote.offer.policyId + quote.offer.name || "lovelace")}`;
    } else if (record.kind === "ProposalDatum") {
      if (expired) throw new Error("These option terms have expired.");
      action = {
        kind: "option-purchase",
        record,
        termsIndex: term,
        paymentDeposit: deposit,
        contractTopUp: deposit,
      };
      description =
        "Pay the chosen premium and receive the option’s ownership key.";
    } else if (record.lane === "option-active") {
      action = expired
        ? { kind: "option-expired-close", record }
        : { kind: "option-exercise", record, paymentDeposit: deposit };
      description = expired
        ? "After expiry, the writer can reclaim the offered assets. The writer’s stake signature is required."
        : "Pay the strike amount and receive the contract’s offered assets. The option ownership key is required.";
    } else if (record.kind === "SpotDatum") {
      action = { kind: "spot-purchase", record, paymentDeposit: deposit };
      description =
        "Pay the complete asking-price basket and receive the listed NFT assets.";
    } else if (record.lane === "loan-active") {
      action =
        loanMode === "repay"
          ? { kind: "loan-repay", record, paymentDeposit: deposit }
          : loanMode === "accrue"
            ? {
                kind: "loan-accrue",
                record,
                times: Number(periods),
                depositTopUp: deposit,
              }
            : { kind: "loan-claim", record, claimant };
      description =
        loanMode === "repay"
          ? "Repay the full on-chain outstanding balance and release collateral. Periodic-interest loans must be current."
          : loanMode === "accrue"
            ? "Apply only elapsed interest periods and the contract’s penalties. Existing contract observers enforce the transition."
            : "An expired loan can be claimed by the lender with its key, or unlocked by the borrower after the claim window. Dingo verifies timing and signatures.";
    } else if (record.kind === "OfferDatum") {
      const ask =
        records.find((r) => r.outpoint === askId && r.kind === "AskDatum") ??
        (importedRequest.data?.outpoint === askId
          ? importedRequest.data
          : undefined);
      if (!ask)
        throw new Error(
          "Choose your matching loan request to accept this offer.",
        );
      collateralChoices = loanCollateralChoices(ask, record);
      if (!collateralChoices.length)
        throw new Error(
          "This request and offer have no compatible collateral.",
        );
      const collateral =
        collateralChoices.length === 1
          ? collateralChoices[0]
          : collateralSelection.ask === ask.outpoint
            ? collateralChoices.find(
                (asset) =>
                  (assetUnit(asset) || "lovelace") === collateralSelection.unit,
              )
            : undefined;
      if (!collateral)
        throw new Error("Choose the collateral asset to lock for this loan.");
      collateralChoice = assetUnit(collateral) || "lovelace";
      action = {
        kind: "loan-accept",
        collateral,
        ask,
        offer: record,
        collateralDeposit: deposit,
        lenderTopUp: deposit,
      };
      description =
        "Lock the agreed collateral and accept the offered principal. Terms and borrower ownership are verified before signing.";
    }
    if (action && needsKernelDeposits(action)) {
      if (outputParameters.error) throw outputParameters.error;
      if (!outputParameters.data)
        throw new Error("Reading current minimum ADA parameters from Dingo…");
      if (now === undefined) throw new Error("Current chain time is required.");
      depositPreview = kernelMinimumDeposits(
        action,
        outputParameters.data,
        stakeHash,
        now,
      );
      action = depositPreview.action;
    }
  } catch (cause) {
    action = null;
    error =
      cause instanceof Error ? cause.message : "Review this position’s terms.";
  }
  const key = JSON.stringify([
    record.outpoint,
    action?.kind ?? null,
    amount,
    side,
    term,
    outputParameters.data,
    swapTopUp,
    askId,
    collateralSelection.ask,
    collateralSelection.unit,
    loanMode,
    periods,
    claimant,
  ]);
  return (
    <section className="market-form">
      <h2>Selected position</h2>
      {recordTitle(record)}
      {recordTerms(record, term)}
      <div className="market-actions">
        <Link to={`/explorer/tx/${record.utxo.input().transactionId()}`}>
          Inspect transaction ↗
        </Link>
        <CopyButton value={record.outpoint} label="output reference" />
      </div>
      {swap && (
        <>
          <label>
            Receive{" "}
            {marketAssetName(kernelSwapAssets(record, side).offer ?? "")}
            <input
              inputMode="decimal"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
            />
            <small>
              ADA uses six decimal places; native tokens use base units.
            </small>
          </label>
          {record.lane === "two-way" && (
            <div className="market-mode">
              <button aria-pressed={side === 1} onClick={() => setSide(1)}>
                Receive asset 1
              </button>
              <button aria-pressed={side === 2} onClick={() => setSide(2)}>
                Receive asset 2
              </button>
            </div>
          )}
        </>
      )}
      {swap && (
        <label>
          Additional ADA for the continuing order
          <input
            inputMode="decimal"
            value={swapTopUp}
            onChange={(e) => setSwapTopUp(e.target.value)}
          />
          <small>
            Added to the order, not returned to you. When receiving ADA, reduce
            the received amount instead.
          </small>
        </label>
      )}
      {record.kind === "ProposalDatum" && (
        <label>
          Available option terms
          <select
            value={term}
            onChange={(e) => setTerm(Number(e.target.value))}
          >
            {terms.map((t, i) => (
              <option value={i} key={i}>
                Premium{" "}
                {marketAmount(
                  kernelInteger(t.premium) ?? 0n,
                  kernelAsset(f.premium_asset) ?? "lovelace",
                )}{" "}
                · expires{" "}
                {new Date(kernelExpiry(t.expiration) ?? 0).toLocaleDateString()}
              </option>
            ))}
          </select>
        </label>
      )}
      {record.kind === "ProposalDatum" && selectedTerms && (
        <p className="market-help">
          Selected premium:{" "}
          {marketAmount(
            kernelInteger(selectedTerms.premium) ?? 0n,
            kernelAsset(f.premium_asset) ?? "lovelace",
          )}
        </p>
      )}
      {record.kind === "OfferDatum" && (
        <>
          <label>
            Your loan request
            <select value={askId} onChange={(e) => setAskId(e.target.value)}>
              <option value="">Choose a request…</option>
              {[
                ...records.filter((r) => r.kind === "AskDatum"),
                ...(importedRequest.data &&
                !records.some(
                  (r) => r.outpoint === importedRequest.data.outpoint,
                )
                  ? [importedRequest.data]
                  : []),
              ].map((r) => (
                <option key={r.outpoint} value={r.outpoint}>
                  {marketAmount(
                    kernelInteger(r.fields.loan_principal) ?? 0n,
                    kernelAsset(r.fields.loan_asset) ?? "lovelace",
                  )}{" "}
                  · {r.outpoint.slice(0, 12)}
                </option>
              ))}
            </select>
          </label>
          {!!collateralChoices.length && (
            <label>
              Collateral asset to lock
              <select
                aria-label="Loan collateral"
                value={collateralChoice}
                disabled={collateralChoices.length === 1}
                onChange={(e) =>
                  setCollateralSelection({ ask: askId, unit: e.target.value })
                }
              >
                <option value="">Choose collateral…</option>
                {collateralChoices.map((asset) => {
                  const unit = assetUnit(asset) || "lovelace";
                  return (
                    <option key={unit} value={unit}>
                      {marketAssetName(unit)}
                      {unit !== "lovelace" ? ` · ${unit}` : ""}
                    </option>
                  );
                })}
              </select>
            </label>
          )}
          <label>
            Import a request from another page
            <input
              value={requestInput}
              onChange={(e) => setRequestInput(e.target.value)}
              placeholder="Transaction hash#output index"
            />
          </label>
          <button
            disabled={!requestInput.trim() || importedRequest.isFetching}
            onClick={() => {
              const ref = requestInput.trim().toLowerCase();
              setRequestRef(ref);
              setAskId(ref);
              if (ref === requestRef) void importedRequest.refetch();
            }}
          >
            Load request
          </button>
          {importedRequest.error && (
            <p role="alert">{importedRequest.error.message}</p>
          )}
        </>
      )}
      {record.lane === "loan-active" && (
        <>
          <div className="market-mode">
            <button
              aria-pressed={loanMode === "repay"}
              onClick={() => setLoanMode("repay")}
            >
              Repay
            </button>
            <button
              aria-pressed={loanMode === "accrue"}
              onClick={() => setLoanMode("accrue")}
            >
              Accrue interest
            </button>
            <button
              aria-pressed={loanMode === "claim"}
              onClick={() => setLoanMode("claim")}
            >
              Expired loan
            </button>
          </div>
          {loanMode === "accrue" && (
            <label>
              Elapsed periods to apply
              <input
                type="number"
                min="1"
                max="24"
                value={periods}
                onChange={(e) => setPeriods(e.target.value)}
              />
            </label>
          )}
          {loanMode === "claim" && (
            <label>
              Claim as
              <select
                value={claimant}
                onChange={(e) => setClaimant(e.target.value as typeof claimant)}
              >
                <option value="borrower">Borrower · after claim window</option>
                <option value="lender">Lender · after loan expiry</option>
              </select>
            </label>
          )}
        </>
      )}
      {depositPreview && (
        <div className="market-help">
          <strong>Exact output amounts · minimum ADA from Dingo</strong>
          {depositPreview.outputs.map((output, index) => (
            <p key={index}>
              {output.label}: {marketAmount(output.coin, "lovelace")}
              {output.assets
                .map(
                  (asset) => ` + ${marketAmount(asset.quantity, asset.unit)}`,
                )
                .join("")}{" "}
              · extra ADA: {marketAmount(output.extra, "lovelace")}
            </p>
          ))}
        </div>
      )}
      {description && (
        <div className="market-quote">
          <span className="eyebrow">Direct settlement</span>
          <p>{description}</p>
          {quote && <strong>No batcher fee</strong>}
        </div>
      )}
      {error && (
        <p role="status" className="market-help">
          {error}
        </p>
      )}
      {action && (
        <MarketTransaction
          tracking={tracking}
          draftKey={key}
          ready
          title={
            swap
              ? "Fill this order"
              : record.kind === "ProposalDatum"
                ? "Purchase this option"
                : record.lane === "option-active"
                  ? expired
                    ? "Reclaim expired option"
                    : "Exercise this option"
                  : record.lane === "loan-active"
                    ? loanMode === "repay"
                      ? "Repay this loan"
                      : loanMode === "accrue"
                        ? "Apply elapsed interest"
                        : "Claim expired loan"
                    : record.kind === "OfferDatum"
                      ? "Accept this loan offer"
                      : "Purchase this listing"
          }
          prepare={(api, guard) =>
            prepareKernelTransaction(api, action!, guard)
          }
          submit={(draft, api, guard) =>
            submitKernelTransaction(api, draft, guard)
          }
        />
      )}
      {closable && (
        <MarketTransaction
          tracking={tracking}
          draftKey={`close:${record.outpoint}`}
          ready
          title="Close your position"
          prepare={(api, guard) =>
            prepareKernelTransaction(
              api,
              { kind: "close-position", record },
              guard,
            )
          }
          submit={(draft, api, guard) =>
            submitKernelTransaction(api, draft, guard)
          }
        />
      )}
    </section>
  );
}
export function KernelMarket({ family }: { family: Family }) {
  const [hash, setHash] = useState("");
  const tracking = { hash, submitted: setHash };
  const [lane, setLane] = useState<KernelLane>(
      family === "options" ? "option-active" : lanes[family][0].lane,
    ),
    [tokens, setTokens] = useState<string[]>([""]),
    [page, setPage] = useState(0),
    [search, setSearch] = useState(""),
    [selected, setSelected] = useState("");
  useEffect(
    () =>
      useTipStore.subscribe((next, previous) => {
        if (
          next.revision !== previous.revision &&
          next.lastAction !== "apply"
        ) {
          setTokens([""]);
          setPage(0);
          setSelected("");
        }
      }),
    [],
  );
  const market = useQuery(kernelPageQuery(lane, tokens[page]));
  const records = market.data?.records ?? [],
    record = records.find((r) => r.outpoint === selected) ?? records[0];
  const visible = records.filter((r) =>
    `${r.kind} ${r.outpoint} ${JSON.stringify(r.fields, (_, v) => (typeof v === "bigint" ? String(v) : v))}`
      .toLowerCase()
      .includes(search.toLowerCase().trim()),
  );
  const titles = {
    lending: ["Set your terms.", "Fund real possibilities."],
    options: ["Price the possibility.", "Own the choice."],
    orders: ["The chain is", "the order book."],
    marketplace: ["Trade the position.", "Keep the possibilities."],
  };
  const details = {
    lending:
      "Peer-to-peer loan requests, offers, and repayment—without an external lending API.",
    options:
      "Covered options with public strikes, premiums, and expirations. Every position is an on-chain output.",
    orders:
      "Discover limit orders and fill them directly. No privileged batcher and no separate order-book service.",
    marketplace:
      "NFTs can carry financial rights. Trade spot listings and inspect bids directly through their on-chain terms.",
  };
  const total = records.reduce((sum, r) => sum + r.lovelace, 0n);
  return (
    <div className="markets-page">
      <MarketConfirmation tracking={tracking} />
      <section className="market-hero">
        <div>
          <span className="eyebrow">
            DeFi Kernel · Preprod · powered by Dingo
          </span>
          <h1>
            {titles[family][0]}
            <br />
            <em>{titles[family][1]}</em>
          </h1>
          <p>{details[family]}</p>
          <div className="market-source">
            <span>Existing Kernel contracts</span>
            <span>Data & settlement: Dingo</span>
            <a
              href={`https://github.com/fallen-icarus/${family === "lending" ? "cardano-loans" : family === "options" ? "cardano-options" : family === "orders" ? "cardano-swaps" : "cardano-aftermarket"}`}
              target="_blank"
              rel="noreferrer"
            >
              Contract specification ↗
            </a>
          </div>
        </div>
        {marketDiagram(family, record)}
      </section>
      <div className="market-mode" aria-label="Kernel market view">
        {lanes[family].map((item) => (
          <button
            key={item.lane}
            aria-pressed={item.lane === lane}
            onClick={() => {
              setLane(item.lane);
              setTokens([""]);
              setPage(0);
              setSelected("");
            }}
          >
            {item.label}
          </button>
        ))}
      </div>
      {market.isPending || market.error ? (
        <MarketLoading
          error={market.error}
          retry={() => void market.refetch()}
        />
      ) : (
        <>
          <div className="market-stats">
            <div>
              <span className="eyebrow">Loaded page</span>
              <strong>{records.length} positions</strong>
              <small>At most 24 outputs · no full-chain scan</small>
            </div>
            <div>
              <span className="eyebrow">ADA in these outputs</span>
              <strong>{marketAmount(total, "lovelace")}</strong>
              <small>Includes contract deposits · not total market TVL</small>
            </div>
            <div>
              <span className="eyebrow">Verified snapshot</span>
              <strong>
                {market.data?.snapshot
                  ? `#${market.data.snapshot.height.toLocaleString()}`
                  : "No tip returned"}
              </strong>
              <small>
                {market.data?.nextToken
                  ? "More outputs available"
                  : "End of this lane’s result set"}
              </small>
            </div>
          </div>
          <div className="market-layout">
            <section className="market-catalog">
              <div className="market-toolbar">
                <div>
                  <span className="eyebrow">Live contract outputs</span>
                  <h2>
                    {lanes[family].find((item) => item.lane === lane)?.label}
                  </h2>
                </div>
                <button onClick={() => void market.refetch()}>Refresh ↻</button>
              </div>
              <input
                type="search"
                className="market-search"
                aria-label="Filter Kernel positions"
                placeholder="Filter this page by asset, position type, or output…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
              <div className="market-grid">
                {visible.map((r) => (
                  <button
                    className={`market-card${r.outpoint === record?.outpoint ? " selected" : ""}`}
                    key={r.outpoint}
                    aria-pressed={r.outpoint === record?.outpoint}
                    onClick={() => setSelected(r.outpoint)}
                  >
                    <small>
                      {r.kind
                        .replace(/Datum$/, "")
                        .replace(/([a-z])([A-Z])/g, "$1 $2")}
                    </small>
                    {recordTitle(r)}
                    {recordTerms(r)}
                    <small>
                      {r.outpoint.slice(0, 14)}…#
                      {r.utxo.input().index().toString()}
                    </small>
                  </button>
                ))}
              </div>
              {!visible.length && (
                <div className="market-empty">
                  <strong>
                    {records.length
                      ? "No matching positions on this page"
                      : "No open positions in this lane"}
                  </strong>
                  <p>
                    {records.length
                      ? "Change your filter to see more of the loaded page."
                      : "The reference scripts are verified, but Dingo returned no current outputs for this policy. Create a position to begin."}
                  </p>
                </div>
              )}
              {!!market.data?.rejected.length && (
                <div className="market-help" role="status">
                  {market.data.rejected.length} unsupported outputs were
                  excluded.{" "}
                  <details>
                    <summary>View reasons</summary>
                    {market.data.rejected.map((r) => (
                      <p key={r.outpoint}>{r.reason}</p>
                    ))}
                  </details>
                </div>
              )}
              <div className="market-pagination">
                <button
                  disabled={page === 0}
                  onClick={() => {
                    setPage((p) => p - 1);
                    setSelected("");
                  }}
                >
                  ← Previous
                </button>
                <span>Page {page + 1}</span>
                <button
                  disabled={!market.data?.nextToken}
                  onClick={() => {
                    setTokens([
                      ...tokens.slice(0, page + 1),
                      market.data!.nextToken,
                    ]);
                    setPage((p) => p + 1);
                    setSelected("");
                  }}
                >
                  More positions →
                </button>
              </div>
            </section>
            {record ? (
              <SelectedAction
                tracking={tracking}
                key={record.outpoint}
                selection={{
                  lane,
                  cursor: tokens[page],
                  outpoint: record.outpoint,
                }}
              />
            ) : (
              <KernelCreate
                tracking={tracking}
                key={`${family}:empty`}
                family={family}
              />
            )}
          </div>
          {record && (
            <KernelCreate
              tracking={tracking}
              key={`${family}:${record.outpoint}`}
              family={family}
              selection={{
                lane,
                cursor: tokens[page],
                outpoint: record.outpoint,
              }}
            />
          )}
        </>
      )}
      <p className="market-help">
        Discovery uses beacon-policy queries and existing reference scripts
        through Dingo.{" "}
        <Link to={`/explorer/policy/${KERNEL_LANES[lane].beaconPolicy}`}>
          Explore this protocol’s beacon policy ↗
        </Link>
      </p>
    </div>
  );
}
