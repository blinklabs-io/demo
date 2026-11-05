import { useState } from "react";
import { Core } from "@blaze-cardano/sdk";
import { useWalletStore } from "../../stores/walletStore";
import {
  ADA,
  validateKernelCreation,
  type KernelAsset,
  type KernelCreation,
} from "../../lib/kernel/actions";
import {
  prepareKernelTransaction,
  submitKernelTransaction,
} from "../../lib/kernel/transactions";
import { useKernelSelection, type KernelSelection } from "./kernelQuery";
import { MarketTransaction, type MarketTracking } from "./MarketTransaction";
import { MarketAsset } from "./assets";
import { decimalFraction, marketAssetName, rawAmount } from "./amounts";
import { kernelAsset, kernelInteger, kernelSwapAssets } from "./kernelView";

export function AssetField({
  label,
  value,
  onChange,
  ada = true,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  ada?: boolean;
}) {
  const tokens = useWalletStore((s) => s.tokens);
  const [page, setPage] = useState(0),
    [filter, setFilter] = useState("");
  const matches = tokens.filter((t) =>
    `${marketAssetName(t.assetId)} ${t.assetId}`
      .toLowerCase()
      .includes(filter.toLowerCase()),
  );
  return (
    <div className="market-asset-field">
      <label>
        {label}
        <input
          aria-label={label}
          value={value}
          onChange={(e) => onChange(e.target.value.trim())}
          placeholder={
            ada
              ? "lovelace or policy ID + hex asset name"
              : "Policy ID + hexadecimal asset name"
          }
        />
      </label>
      {value && <MarketAsset unit={value} />}
      {!!tokens.length && (
        <>
          <input
            className="market-search"
            type="search"
            aria-label={`Filter ${label}`}
            placeholder="Choose an asset from your wallet…"
            value={filter}
            onChange={(e) => {
              setFilter(e.target.value);
              setPage(0);
            }}
          />
          <div className="market-asset-choices">
            {ada && (
              <button
                onClick={() => onChange("lovelace")}
                type="button"
                aria-pressed={value === "lovelace"}
              >
                <MarketAsset unit="lovelace" />
              </button>
            )}
            {matches.slice(page * 6, page * 6 + 6).map((token) => (
              <button
                key={token.assetId}
                type="button"
                aria-pressed={value === token.assetId}
                onClick={() => onChange(token.assetId)}
              >
                <MarketAsset unit={token.assetId} />
                <small>{token.quantity.toLocaleString()} base units</small>
              </button>
            ))}
          </div>
          {matches.length > 6 && (
            <div className="market-pagination">
              <button
                type="button"
                disabled={page === 0}
                onClick={() => setPage((p) => p - 1)}
              >
                ←
              </button>
              <span>
                {page + 1} / {Math.ceil(matches.length / 6)}
              </span>
              <button
                type="button"
                disabled={(page + 1) * 6 >= matches.length}
                onClick={() => setPage((p) => p + 1)}
              >
                →
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
function inputKernelAsset(unit: string): KernelAsset {
  if (unit === "lovelace") return ADA;
  if (!/^[a-f\d]{56}(?:[a-f\d]{2}){0,32}$/.test(unit))
    throw new Error("Choose ADA or a complete native asset ID.");
  return { policyId: unit.slice(0, 56), name: unit.slice(56) };
}
function borrowerHash(value: string) {
  if (!value.trim())
    throw new Error(
      "Select a borrower’s request or enter their stake address.",
    );
  const address = Core.Address.fromBech32(value),
    props = address.getProps();
  const credential =
    address.asReward()?.getPaymentCredential() ?? props.delegationPart;
  if (
    address.getNetworkId() !== 0 ||
    credential?.type !== Core.CredentialType.KeyHash
  )
    throw new Error(
      "Enter the borrower’s testnet stake address or base address.",
    );
  return String(credential.hash);
}
export function KernelCreate({
  family,
  selection,
  tracking,
}: {
  tracking: MarketTracking;
  family: "lending" | "options" | "marketplace" | "orders";
  selection?: KernelSelection;
}) {
  const { record } = useKernelSelection(selection);
  const [mode, setMode] = useState<"loan-ask" | "loan-offer">(
    record?.kind === "AskDatum" ? "loan-offer" : "loan-ask",
  );
  const selectedPrincipal = kernelInteger(record?.fields.loan_principal);
  const selectedTerm = kernelInteger(record?.fields.loan_term);
  const [principal, setPrincipal] = useState(
      selectedPrincipal !== null &&
        kernelAsset(record?.fields.loan_asset) === "lovelace"
        ? `${selectedPrincipal / 1000000n}.${(selectedPrincipal % 1000000n).toString().padStart(6, "0")}`
        : "100",
    ),
    [days, setDays] = useState(
      selectedTerm !== null && selectedTerm % 86400000n === 0n
        ? String(selectedTerm / 86400000n)
        : "30",
    ),
    [interest, setInterest] = useState("10"),
    [claimDays, setClaimDays] = useState("7");
  const firstCollateral =
    record && Array.isArray(record.fields.collateral)
      ? record.fields.collateral[0]
      : undefined;
  const [collateral, setCollateral] = useState(
    kernelAsset(firstCollateral) ?? "",
  );
  const [borrower, setBorrower] = useState(() => {
    const hash = record?.fields.borrower_id;
    return typeof hash === "string" && /^[a-f\d]{56}$/.test(hash)
      ? Core.RewardAddress.fromCredentials(0, {
          type: Core.CredentialType.KeyHash,
          hash: Core.Hash28ByteBase16(hash),
        })
          .toAddress()
          .toBech32()
      : "";
  });
  const [ratio, setRatio] = useState("1");
  const pair =
    record && (record.lane === "one-way" || record.lane === "two-way")
      ? kernelSwapAssets(record)
      : undefined;
  const [offer, setOffer] = useState(pair?.offer ?? "lovelace"),
    [ask, setAsk] = useState(
      pair?.ask ?? (record ? (kernelAsset(record.fields.ask_asset) ?? "") : ""),
    );
  const [premium, setPremium] = useState("lovelace"),
    [premiumAmount, setPremiumAmount] = useState("1");
  const [quantity, setQuantity] = useState("10"),
    [strike, setStrike] = useState("1"),
    [deposit, setDeposit] = useState("5");
  const [expiry, setExpiry] = useState(() =>
    new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 16),
  );
  const [nft, setNft] = useState(""),
    [salePrice, setSalePrice] = useState("10");
  let action: KernelCreation | null = null,
    error = "";
  try {
    const adaDeposit = rawAmount(deposit, "lovelace");
    if (family === "lending") {
      const base = {
        principal: rawAmount(principal, "lovelace"),
        termDays: Number(days),
        collateral: inputKernelAsset(collateral),
        deposit: adaDeposit,
      };
      if (mode === "loan-ask") action = { ...base, kind: mode };
      else {
        const rate = decimalFraction(interest, 1n, 100n);
        action = {
          ...base,
          kind: mode,
          borrowerStakeHash: borrowerHash(borrower),
          interest: rate,
          collateralRatio: decimalFraction(ratio, 1n, 1000000n),
          claimDays: Number(claimDays),
        };
      }
    } else if (family === "options")
      action = {
        kind: "option-proposal",
        offer: inputKernelAsset(offer),
        offerQuantity: rawAmount(quantity, offer),
        ask: inputKernelAsset(ask),
        premium: inputKernelAsset(premium),
        premiumQuantity: rawAmount(premiumAmount, premium),
        strike: decimalFraction(
          strike,
          ask === "lovelace" ? 1000000n : 1n,
          offer === "lovelace" ? 1000000n : 1n,
        ),
        expiresAt: new Date(expiry + "Z").getTime(),
        deposit: adaDeposit,
      };
    else if (family === "marketplace")
      action = {
        kind: "spot-sale",
        nft: inputKernelAsset(nft),
        price: rawAmount(salePrice, "lovelace"),
        deposit: adaDeposit,
      };
    else
      action = {
        kind: "limit-order",
        offer: inputKernelAsset(offer),
        offerQuantity: rawAmount(quantity, offer),
        ask: inputKernelAsset(ask),
        price: decimalFraction(
          strike,
          ask === "lovelace" ? 1000000n : 1n,
          offer === "lovelace" ? 1000000n : 1n,
        ),
        deposit: adaDeposit,
      };
    validateKernelCreation(action);
  } catch (cause) {
    action = null;
    error =
      cause instanceof Error
        ? cause.message
        : "Complete the transaction details.";
  }
  const key = JSON.stringify([
    family,
    mode,
    principal,
    days,
    interest,
    claimDays,
    collateral,
    borrower,
    ratio,
    offer,
    ask,
    premium,
    premiumAmount,
    quantity,
    strike,
    deposit,
    expiry,
    nft,
    salePrice,
  ]);
  return (
    <section className="market-form market-create">
      <h2>
        {family === "lending"
          ? "Create a loan position"
          : family === "options"
            ? "Write a covered option"
            : family === "marketplace"
              ? "List an NFT or position"
              : "Place a limit order"}
      </h2>
      {family === "lending" ? (
        <>
          <div className="market-mode">
            <button
              aria-pressed={mode === "loan-ask"}
              onClick={() => setMode("loan-ask")}
            >
              Request a loan
            </button>
            <button
              aria-pressed={mode === "loan-offer"}
              onClick={() => setMode("loan-offer")}
            >
              Offer a loan
            </button>
          </div>
          <label>
            Principal (ADA)
            <input
              inputMode="decimal"
              value={principal}
              onChange={(e) => setPrincipal(e.target.value)}
            />
          </label>
          <label>
            Loan term (days)
            <input
              type="number"
              min="1"
              max="3650"
              value={days}
              onChange={(e) => setDays(e.target.value)}
            />
          </label>
          <AssetField
            label="Collateral asset"
            value={collateral}
            onChange={setCollateral}
            ada={false}
          />
          {mode === "loan-offer" && (
            <>
              <label>
                Borrower stake address
                <input
                  value={borrower}
                  onChange={(e) => setBorrower(e.target.value)}
                  placeholder="stake_test1… or a base address"
                />
              </label>
              <label>
                Interest for the full term (%)
                <input
                  inputMode="decimal"
                  value={interest}
                  onChange={(e) => setInterest(e.target.value)}
                />
              </label>
              <label>
                Collateral base units per ADA lent
                <input
                  inputMode="decimal"
                  value={ratio}
                  onChange={(e) => setRatio(e.target.value)}
                />
              </label>
              <label>
                Claim window after expiry (days)
                <input
                  type="number"
                  value={claimDays}
                  onChange={(e) => setClaimDays(e.target.value)}
                />
              </label>
            </>
          )}
          <p className="market-help">
            {mode === "loan-ask"
              ? "A request describes your terms and locks one sample collateral unit. It does not borrow funds. An accepted offer is a separate on-chain transaction."
              : "An offer locks its ADA principal at the borrower’s loan address. Its terms specify the full-term interest and required collateral."}
          </p>
        </>
      ) : family === "marketplace" ? (
        <>
          <AssetField
            label="NFT or position asset"
            value={nft}
            onChange={setNft}
            ada={false}
          />
          <label>
            Asking price (ADA)
            <input
              inputMode="decimal"
              value={salePrice}
              onChange={(e) => setSalePrice(e.target.value)}
            />
          </label>
          <p className="market-help">
            Lists one unit for a direct spot sale. Check the NFT’s underlying
            rights before listing a financial position.
          </p>
        </>
      ) : (
        <>
          <AssetField label="Offered asset" value={offer} onChange={setOffer} />
          <label>
            Offered amount
            <input
              inputMode="decimal"
              value={quantity}
              onChange={(e) => setQuantity(e.target.value)}
            />
            <small>
              {offer === "lovelace" ? "ADA" : "Whole token base units"}
            </small>
          </label>
          <AssetField
            label={
              family === "options"
                ? "Exercise payment asset"
                : "Requested asset"
            }
            value={ask}
            onChange={setAsk}
          />
          <label>
            {family === "options" ? "Strike price" : "Limit price"} (
            {marketAssetName(ask) || "requested asset"} per{" "}
            {marketAssetName(offer)})
            <input
              inputMode="decimal"
              value={strike}
              onChange={(e) => setStrike(e.target.value)}
            />
            <small>ADA amounts use ADA; other tokens use base units.</small>
          </label>
          {family === "options" && (
            <>
              <AssetField
                label="Premium asset"
                value={premium}
                onChange={setPremium}
              />
              <label>
                Premium amount
                <input
                  inputMode="decimal"
                  value={premiumAmount}
                  onChange={(e) => setPremiumAmount(e.target.value)}
                />
                <small>
                  {premium === "lovelace" ? "ADA" : "Whole token base units"}
                </small>
              </label>
              <label>
                Expiration (UTC)
                <input
                  type="datetime-local"
                  value={expiry}
                  onChange={(e) => setExpiry(e.target.value)}
                />
              </label>
            </>
          )}
        </>
      )}
      <label>
        ADA reserved in the contract output
        <input
          inputMode="decimal"
          value={deposit}
          onChange={(e) => setDeposit(e.target.value)}
        />
        <small>
          Minimum 2 ADA; Dingo evaluates the final output size and script
          budget.
        </small>
      </label>
      {error && (
        <p className="market-help" role="status">
          {error}
        </p>
      )}
      {action && (
        <div className="market-quote">
          <span className="eyebrow">Contract preview</span>
          <strong>
            {family === "lending"
              ? `${principal} ADA · ${days} days`
              : family === "marketplace"
                ? `${salePrice} ADA asking price`
                : `${quantity} ${marketAssetName(offer)}`}
          </strong>
          <p>
            {deposit} ADA reserved · existing DeFi Kernel contracts · direct
            Dingo submission
          </p>
        </div>
      )}
      <MarketTransaction
        tracking={tracking}
        draftKey={key}
        ready={!!action}
        title="Review your Kernel transaction"
        prepare={(api, guard) => prepareKernelTransaction(api, action!, guard)}
        submit={(draft, api, guard) =>
          submitKernelTransaction(api, draft, guard)
        }
      />
    </section>
  );
}
