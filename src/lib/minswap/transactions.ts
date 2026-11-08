import { DINGO_NETWORK } from "../dingo/config";
import { CARDANO_NETWORK_ID } from "../dingo/networkIdentity";
import { Core } from "@blaze-cardano/sdk";
import type { Cip30WalletApi } from "../dingo/cip30";
import { getBlaze } from "../dingo/blaze";
import {
  assertWalletSession,
  assertTransactionNetwork,
} from "../dingo/walletSession";
import { assertSignedWithKey } from "../dingo/signatureWitness";
import { blockfrostFetch } from "../dingo/blockfrost";
import { inputId, walletOutputs } from "../tools/transactions";
import {
  minswapDeployment,
  minswapOrderReference,
  ORDER_DEPOSIT_ADA,
  BATCHER_FEE,
} from "./constants";
import { type MinswapPool, type MinswapUtxo } from "./data";
import { assertMinswapGenesis, readMinswapPool } from "./read";
import {
  constr,
  decodeOrder,
  orderAddress,
  minswapOrderAccount,
  orderDatum,
  type MinswapAction,
  type MinswapOrder,
} from "./orders";
import { quoteDeposit, quoteSwap, quoteWithdraw } from "./quotes";


async function identity(api: Cip30WalletApi, assertCurrent: () => void) {
  await assertWalletSession(api, assertCurrent);
  const address = Core.Address.fromBytes(
    Core.HexBlob(await api.getChangeAddress()),
  );
  assertCurrent();
  const payment = address.getProps().paymentPart;
  if (
    address.getNetworkId() !== CARDANO_NETWORK_ID ||
    payment?.type !== Core.CredentialType.KeyHash ||
    (!address.asBase() && !address.asEnterprise())
  )
    throw new Error(
      `Connect a ${DINGO_NETWORK.label} wallet with a base or enterprise payment signing key.`,
    );
  return { address, key: String(payment.hash) };
}
async function timing(assertCurrent: () => void) {
  const tip = await blockfrostFetch<{ slot: number }>("/api/v0/blocks/latest");
  assertCurrent();
  if (!Number.isSafeInteger(tip.slot) || tip.slot < 0)
    throw new Error(`Dingo returned invalid ${DINGO_NETWORK.label} timing.`);
  return tip.slot;
}
async function deployment() {
  const scripts = await Promise.all(
    [minswapDeployment().poolScriptHash, minswapDeployment().orderScriptHash].map(
      (hash) =>
        blockfrostFetch<{ script_hash: string; type: string }>(
          `/api/v0/scripts/${hash}`,
        ),
    ),
  );
  if (
    scripts.some(
      (script, index) =>
        script.type !== "plutusV2" ||
        script.script_hash !==
          [
            minswapDeployment().poolScriptHash,
            minswapDeployment().orderScriptHash,
          ][index],
    )
  )
    throw new Error(
      "Dingo did not verify the canonical Minswap V2 deployment.",
    );
}
function asRow(utxo: Core.TransactionUnspentOutput): MinswapUtxo {
  const output = utxo.output();
  return {
    address: output.address().toBech32(),
    tx_hash: utxo.input().transactionId(),
    output_index: Number(utxo.input().index()),
    inline_datum: output.datum()?.asInlineData()?.toCbor() ?? null,
    amount: [
      { unit: "lovelace", quantity: output.amount().coin().toString() },
      ...[...(output.amount().multiasset() ?? [])].map(([unit, amount]) => ({
        unit: String(unit),
        quantity: String(amount),
      })),
    ],
  };
}
async function signingKeys(
  api: Cip30WalletApi,
  tx: Core.Transaction,
  key: string,
  assertCurrent: () => void,
  scriptInput?: string,
) {
  const owned = await walletOutputs(api);
  if (tx.body().collateral()?.size()) {
    const collateral = await api.getCollateral();
    for (const cbor of collateral ?? [])
      owned.push(Core.TransactionUnspentOutput.fromCbor(Core.HexBlob(cbor)));
  }
  assertCurrent();
  const byId = new Map(owned.map((row) => [inputId(row), row]));
  const keys = new Set([key]);
  for (const input of [
    ...tx.body().inputs().values(),
    ...(tx.body().collateral()?.values() ?? []),
  ]) {
    const ref = `${input.transactionId()}#${input.index()}`;
    if (ref === scriptInput) continue;
    const address = byId.get(ref)?.output().address(),
      payment = address?.getProps().paymentPart;
    if (
      address?.getNetworkId() !== CARDANO_NETWORK_ID ||
      payment?.type !== Core.CredentialType.KeyHash
    )
      throw new Error(
        "Minswap funding includes an input outside the connected wallet.",
      );
    keys.add(String(payment.hash));
  }
  return [...keys];
}
async function finalize(
  api: Cip30WalletApi,
  blaze: Awaited<ReturnType<typeof getBlaze>>["blaze"],
  tx: Core.Transaction,
  who: Awaited<ReturnType<typeof identity>>,
  validUntil: number,
  assertCurrent: () => void,
  scriptInput?: string,
) {
  assertCurrent();
  if (
    !tx
      .body()
      .requiredSigners()
      ?.toCore()
      .includes(Core.Ed25519KeyHashHex(who.key))
  )
    throw new Error("Minswap transaction omitted its required owner signer.");
  const keys = await signingKeys(api, tx, who.key, assertCurrent, scriptInput);
  await assertTransactionNetwork(tx, assertCurrent);
  return {
    tx,
    blaze,
    address: who.address.toBech32(),
    validUntil,
    keys,
    bodyCbor: tx.body().toCbor(),
    txHash: String(tx.getId()),
  };
}
export async function prepareMinswapAction(
  api: Cip30WalletApi,
  pool: MinswapPool,
  action: MinswapAction,
  assertCurrent: () => void,
) {
  assertCurrent();
  await assertMinswapGenesis();
  const who = await identity(api, assertCurrent);
  const current = await readMinswapPool(pool);
  await deployment();
  assertCurrent();
  if (pool.assetA !== current.assetA || pool.assetB !== current.assetB)
    throw new Error("Minswap pool assets changed. Refresh the pool list.");
  const value = new Map<string, bigint>();
  const add = (asset: string, quantity: bigint) => {
    if (quantity < 0n) throw new Error("Order amounts cannot be negative.");
    if (quantity > 0n) value.set(asset, (value.get(asset) ?? 0n) + quantity);
  };
  let quote:
    | ReturnType<typeof quoteDeposit>
    | ReturnType<typeof quoteSwap>
    | ReturnType<typeof quoteWithdraw>;
  if (action.kind === "swap") {
    quote = quoteSwap(
      pool,
      action.direction,
      action.amount,
      action.slippageBps,
    );
    if (
      quoteSwap(current, action.direction, action.amount, action.slippageBps)
        .expected < quote.minimum
    )
      throw new Error(
        "The pool quote changed beyond your reviewed minimum. Refresh and review again.",
      );
    add(
      action.direction === "a-to-b" ? current.assetA : current.assetB,
      action.amount,
    );
  } else if (action.kind === "deposit") {
    quote = quoteDeposit(
      pool,
      action.amountA,
      action.amountB,
      action.slippageBps,
    );
    if (
      quoteDeposit(current, action.amountA, action.amountB, action.slippageBps)
        .expected < quote.minimum
    )
      throw new Error(
        "The pool quote changed beyond your reviewed minimum. Refresh and review again.",
      );
    add(current.assetA, action.amountA);
    add(current.assetB, action.amountB);
  } else {
    quote = quoteWithdraw(pool, action.lpAmount, action.slippageBps);
    const available = quoteWithdraw(
      current,
      action.lpAmount,
      action.slippageBps,
    );
    if (
      available.amountA < quote.minimumA ||
      available.amountB < quote.minimumB
    )
      throw new Error(
        "The pool quote changed beyond your reviewed minimum. Refresh and review again.",
      );
    add(current.lpAsset, action.lpAmount);
  }
  if (
    ("minimum" in quote && quote.minimum <= 0n) ||
    ("minimumA" in quote && (quote.minimumA <= 0n || quote.minimumB <= 0n))
  )
    throw new Error(
      "Order amounts are too small after slippage. Increase the amount.",
    );
  add("lovelace", ORDER_DEPOSIT_ADA + BATCHER_FEE);
  const datum = orderDatum(who.address, current.lpAsset, action, quote),
    target = orderAddress(who.address);
  const tokenMap = new Map(
    [...value]
      .filter(([asset]) => asset !== "lovelace")
      .map(([asset, quantity]) => [Core.AssetId(asset), quantity]),
  );
  const orderValue = new Core.Value(
    value.get("lovelace")!,
    tokenMap.size ? tokenMap : undefined,
  );
  const expectedValue = orderValue.toCbor(),
    expectedDatum = datum.toCbor();
  const validUntil = (await timing(assertCurrent)) + 600;
  const { blaze } = await getBlaze(api);
  const tx = await blaze
    .newTransaction()
    .lockAssets(target, orderValue, Core.Datum.newInlineData(datum))
    .addRequiredSigner(Core.Ed25519KeyHashHex(who.key))
    .setValidUntil(Core.Slot(validUntil))
    .complete();
  assertCurrent();
  const locked = tx
    .body()
    .outputs()
    .filter((output) => output.address().toBytes() === target.toBytes());
  if (
    locked.length !== 1 ||
    locked[0].amount().toCbor() !== expectedValue ||
    locked[0].datum()?.asInlineData()?.toCbor() !== expectedDatum
  )
    throw new Error(
      "The built Minswap order differs from the reviewed output.",
    );
  return {
    ...(await finalize(api, blaze, tx, who, validUntil, assertCurrent)),
    kind: action.kind,
    action,
    pool: current,
    quote,
    orderAddress: target.toBech32(),
    batcherFee: BATCHER_FEE,
    deposit: ORDER_DEPOSIT_ADA,
  };
}
export async function prepareMinswapCancel(
  api: Cip30WalletApi,
  order: MinswapOrder,
  assertCurrent: () => void,
) {
  assertCurrent();
  await assertMinswapGenesis();
  const who = await identity(api, assertCurrent),
    { blaze } = await getBlaze(api);
  const requested = new Core.TransactionInput(
    Core.TransactionId(order.txHash),
    BigInt(order.outputIndex),
  );
  const resolved = await blaze.provider.resolveUnspentOutputs([requested]);
  if (
    resolved.length !== 1 ||
    inputId(resolved[0]) !== `${order.txHash}#${order.outputIndex}`
  )
    throw new Error("This Minswap order has already been spent or cancelled.");
  const current = decodeOrder(asRow(resolved[0]));
  const used = await api.getUsedAddresses();
  assertCurrent();
  const account = minswapOrderAccount([
    who.address.toBech32(),
    ...used.map((value) =>
      Core.Address.fromBytes(Core.HexBlob(value)).toBech32(),
    ),
  ]);
  if (!account.keys.has(current.canceller))
    throw new Error(
      "The connected wallet is not this order's cancellation key.",
    );
  const references = await blaze.provider.resolveUnspentOutputs([
    new Core.TransactionInput(
      Core.TransactionId(minswapOrderReference().txHash),
      minswapOrderReference().index,
    ),
  ]);
  if (
    references.length !== 1 ||
    references[0].input().transactionId() !== minswapOrderReference().txHash ||
    references[0].input().index() !== minswapOrderReference().index ||
    references[0].output().scriptRef()?.hash() !==
      minswapDeployment().orderScriptHash
  )
    throw new Error(
      "The canonical Minswap cancellation reference is unavailable.",
    );
  const validUntil = (await timing(assertCurrent)) + 600;
  const tx = await blaze
    .newTransaction()
    .addInput(resolved[0], constr(1))
    .addReferenceInput(references[0])
    .addRequiredSigner(Core.Ed25519KeyHashHex(current.canceller))
    .setValidUntil(Core.Slot(validUntil))
    .complete();
  assertCurrent();
  if (
    !tx
      .body()
      .inputs()
      .values()
      .some(
        (input) =>
          input.transactionId() === requested.transactionId() &&
          input.index() === requested.index(),
      ) ||
    !tx
      .body()
      .referenceInputs()
      ?.values()
      .some(
        (input) =>
          input.transactionId() === minswapOrderReference().txHash &&
          input.index() === minswapOrderReference().index,
      )
  )
    throw new Error(
      "Cancellation omitted its order or canonical reference input.",
    );
  if (
    tx
      .body()
      .outputs()
      .some((output) => output.address().toBytes() !== who.address.toBytes())
  )
    throw new Error("Cancellation sends funds outside the connected wallet.");
  return {
    ...(await finalize(
      api,
      blaze,
      tx,
      { ...who, key: current.canceller },
      validUntil,
      assertCurrent,
      inputId(resolved[0]),
    )),
    kind: "cancel" as const,
    order: current,
    batcherFee: 0n,
    deposit: 0n,
  };
}
export type PreparedMinswap =
  | Awaited<ReturnType<typeof prepareMinswapAction>>
  | Awaited<ReturnType<typeof prepareMinswapCancel>>;
export async function submitMinswapTransaction(
  api: Cip30WalletApi,
  draft: PreparedMinswap,
  assertCurrent: () => void,
) {
  assertCurrent();
  await assertMinswapGenesis();
  const who = await identity(api, assertCurrent);
  if (who.address.toBech32() !== draft.address)
    throw new Error(
      "Wallet account changed. Review a new Minswap transaction.",
    );
  if ((await timing(assertCurrent)) >= draft.validUntil)
    throw new Error(
      "This Minswap transaction draft has expired. Build a new draft.",
    );
  await assertTransactionNetwork(draft.tx, assertCurrent);
  const signed = await draft.blaze.signTransaction(
    Core.Transaction.fromCbor(draft.tx.toCbor()),
  );
  const after = await identity(api, assertCurrent);
  if (after.address.toBech32() !== draft.address)
    throw new Error(
      "Wallet account changed while signing. Nothing was submitted.",
    );
  if ((await timing(assertCurrent)) >= draft.validUntil)
    throw new Error(
      "This Minswap transaction draft expired while signing. Nothing was submitted.",
    );
  if (
    signed.body().toCbor() !== draft.bodyCbor ||
    String(signed.getId()) !== draft.txHash
  )
    throw new Error("Wallet changed the reviewed Minswap transaction body.");
  for (const key of draft.keys)
    assertSignedWithKey(
      signed,
      key,
      "Wallet did not sign every required Minswap funding key. Nothing was submitted.",
    );
  await assertTransactionNetwork(signed, assertCurrent);
  assertCurrent();
  return String(
    await draft.blaze.provider.postTransactionToChain(signed, assertCurrent),
  );
}
