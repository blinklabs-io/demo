import { Blaze, Core, type Wallet } from "@blaze-cardano/sdk";
import { AssetAmount } from "@sundaeswap/asset";
import {
  ADA_METADATA,
  DatumBuilderV3,
  EContractVersion,
  EDatumType,
  SundaeUtils,
  TxBuilderV3,
  type IPoolData,
} from "@sundaeswap/core";
import type { Cip30WalletApi } from "../dingo/cip30";
import { getBlaze } from "../dingo/blaze";
import { blockfrostFetch } from "../dingo/blockfrost";
import {
  assertWalletSession,
  assertTransactionNetwork,
  assertDingoTransactionBackends,
} from "../dingo/walletSession";
import { DingoSundaeQueryProvider } from "./dingoQueryProvider";
import { assertSundaeNetwork, SUNDAE_V3_PROTOCOL } from "./protocol";
import { CARDANO_NETWORK_ID } from "../dingo/networkIdentity";
import type { DingoProvider } from "../dingo/utxorpc/provider";
import { assertSignedWithKey } from "../dingo/signatureWitness";

export type LiquidityAction =
  | { type: "deposit"; amountA: bigint; amountB: bigint }
  | { type: "withdraw"; lp: bigint };
export function quoteLiquidity(pool: IPoolData, action: LiquidityAction) {
  if (
    pool.version !== EContractVersion.V3 ||
    pool.liquidity.aReserve <= 0n ||
    pool.liquidity.bReserve <= 0n ||
    pool.liquidity.lpTotal <= 0n
  )
    throw new Error("Choose an active SundaeSwap V3 pool.");
  const quantities =
    action.type === "deposit" ? [action.amountA, action.amountB] : [action.lp];
  if (quantities.some((quantity) => quantity > 18446744073709551615n))
    throw new Error("Amount exceeds the transaction output limit.");
  if (action.type === "deposit") {
    if (action.amountA <= 0n || action.amountB <= 0n)
      throw new Error("Enter positive amounts for both pool assets.");
    const quote = SundaeUtils.calculateLiquidity(
      pool,
      action.amountA,
      action.amountB,
    );
    if (quote.generatedLp <= 0n)
      throw new Error(
        "Deposit rounds to zero LP tokens. Increase the amounts.",
      );
    return {
      lp: quote.generatedLp,
      amountA: quote.actualDepositedA,
      amountB: quote.actualDepositedB,
      changeA: quote.aChange,
      changeB: quote.bChange,
    };
  }
  if (action.lp <= 0n || action.lp >= pool.liquidity.lpTotal)
    throw new Error(
      "Enter a positive LP amount below the pool's total supply.",
    );
  const amountA =
    (action.lp * pool.liquidity.aReserve) / pool.liquidity.lpTotal;
  const amountB =
    (action.lp * pool.liquidity.bReserve) / pool.liquidity.lpTotal;
  if (amountA <= 0n || amountB <= 0n)
    throw new Error("Withdrawal rounds to zero. Increase the LP amount.");
  return { lp: action.lp, amountA, amountB, changeA: 0n, changeB: 0n };
}
async function slot(assertCurrent: () => void) {
  const tip = await blockfrostFetch<{ slot: number }>("/api/v0/blocks/latest");
  assertCurrent();
  if (!Number.isSafeInteger(tip.slot) || tip.slot < 0)
    throw new Error("Dingo returned an invalid tip slot.");
  return tip.slot;
}
export async function prepareLiquidity(
  api: Cip30WalletApi,
  pool: IPoolData,
  action: LiquidityAction,
  assertCurrent: () => void,
) {
  assertSundaeNetwork();
  quoteLiquidity(pool, action);
  await assertWalletSession(api, assertCurrent);
  const { blaze } = await getBlaze(api);
  assertCurrent();
  const owner = (await blaze.wallet.getChangeAddress()).toBech32();
  const query = new DingoSundaeQueryProvider(blaze.provider);
  const current = await query.findPoolDataByIdent({ ident: pool.ident });
  assertCurrent();
  if (
    current.assetA.assetId !== pool.assetA.assetId ||
    current.assetB.assetId !== pool.assetB.assetId ||
    current.assetLP.assetId !== pool.assetLP.assetId
  )
    throw new Error("Pool assets changed. Select the pool again.");
  const quote = quoteLiquidity(current, action);
  const reviewed = quoteLiquidity(pool, action);
  if (
    quote.lp !== reviewed.lp ||
    quote.amountA !== reviewed.amountA ||
    quote.amountB !== reviewed.amountB
  )
    throw new Error("The liquidity quote changed. Refresh and review again.");
  const builder = new TxBuilderV3(blaze, query);
  if (!(await builder.getSettingsUtxoDatum()))
    throw new Error("SundaeSwap settings datum is unavailable from Dingo.");
  assertCurrent();
  const orderAddresses = {
    DestinationAddress: {
      address: owner,
      datum: { type: EDatumType.NONE as const },
    },
  };
  const composed =
    action.type === "deposit"
      ? await builder.deposit({
          pool: current,
          orderAddresses,
          suppliedAssets: [
            new AssetAmount(action.amountA, current.assetA),
            new AssetAmount(action.amountB, current.assetB),
          ],
        })
      : await builder.withdraw({
          orderAddresses,
          suppliedLPAsset: new AssetAmount(action.lp, current.assetLP),
        });
  return {
    ...(await finish(blaze, api, owner, composed, assertCurrent)),
    quote,
  };
}
async function finish(
  blaze: Blaze<DingoProvider, Wallet>,
  api: Cip30WalletApi,
  owner: string,
  composed: Awaited<ReturnType<TxBuilderV3["deposit"]>>,
  assertCurrent: () => void,
) {
  const validUntil = (await slot(assertCurrent)) + 600;
  composed.tx.setValidUntil(Core.Slot(validUntil));
  const built = await composed.build();
  assertCurrent();
  await assertTransactionNetwork(built.builtTx, assertCurrent, blaze.provider);
  const funding = await blaze.provider.resolveUnspentOutputs([
    ...built.builtTx.body().inputs().values(),
    ...(built.builtTx.body().collateral()?.values() ?? []),
  ]);
  assertCurrent();
  const keys = new Set<string>(
    built.builtTx.body().requiredSigners()?.toCore() ?? [],
  );
  for (const utxo of funding) {
    const payment = utxo.output().address().getProps().paymentPart;
    if (payment?.type === Core.CredentialType.KeyHash)
      keys.add(String(payment.hash));
  }
  const expectedBody = built.builtTx.body().toCbor();
  const expectedAuxiliary = built.builtTx.auxiliaryData()?.toCbor();
  const draft = {
    tx: built.builtTx,
    orderReferences: built.builtTx
      .body()
      .outputs()
      .flatMap((output, index) => {
        const payment = output.address().getProps().paymentPart;
        const script = SUNDAE_V3_PROTOCOL.blueprint.validators.find(
          (v) => v.title === "order.spend",
        )!.hash;
        return payment?.type === Core.CredentialType.ScriptHash &&
          payment.hash === script
          ? [`${built.builtTx.getId()}#${index}`]
          : [];
      }),
    deposit: composed.fees.deposit.amount,
    scooperFee: composed.fees.scooperFee.amount,
    async signAndSubmit() {
      const assertOwner = async () => {
        await assertDingoTransactionBackends();
        await assertWalletSession(api, assertCurrent);
        if ((await blaze.wallet.getChangeAddress()).toBech32() !== owner)
          throw new Error("Wallet account changed. Review a new order.");
        assertCurrent();
        if ((await slot(assertCurrent)) >= validUntil)
          throw new Error("The draft expired. Build a new order.");
      };
      await assertOwner();
      if (draft.tx.body().toCbor() !== expectedBody)
        throw new Error("The reviewed transaction changed.");
      await assertTransactionNetwork(draft.tx, assertCurrent, blaze.provider);
      const signed = await built.sign();
      await assertOwner();
      const tx = Core.Transaction.fromCbor(Core.TxCBOR(signed.cbor));
      if (
        tx.body().toCbor() !== expectedBody ||
        tx.auxiliaryData()?.toCbor() !== expectedAuxiliary
      )
        throw new Error("The wallet changed the reviewed transaction.");
      for (const key of keys)
        assertSignedWithKey(
          tx,
          key,
          "The wallet did not sign every required funding key.",
        );
      await assertTransactionNetwork(tx, assertCurrent, blaze.provider);
      const id = await blaze.provider.postTransactionToChain(tx, assertCurrent);
      return id.toString();
    },
  };
  return draft;
}
export function liquidityAssetUnit(assetId: string) {
  return assetId === ADA_METADATA.assetId
    ? "lovelace"
    : assetId.replace(".", "");
}

export async function prepareLiquidityCancel(
  api: Cip30WalletApi,
  reference: string,
  assertCurrent: () => void,
) {
  assertSundaeNetwork();
  const match = /^([0-9a-f]{64})#(0|[1-9][0-9]{0,4})$/i.exec(reference.trim());
  if (!match || Number(match[2]) > 65535)
    throw new Error(
      "Enter an order reference as transaction-hash#output-index.",
    );
  await assertWalletSession(api, assertCurrent);
  const { blaze } = await getBlaze(api);
  const owner = (await blaze.wallet.getChangeAddress()).toBech32();
  const input = new Core.TransactionInput(
    Core.TransactionId(match[1].toLowerCase()),
    BigInt(match[2]),
  );
  const outputs = await blaze.provider.resolveUnspentOutputs([input]);
  assertCurrent();
  const utxo = outputs[0];
  if (outputs.length !== 1 || utxo.input().toCbor() !== input.toCbor())
    throw new Error("The order is no longer unspent.");
  const address = utxo.output().address(),
    payment = address.getProps().paymentPart;
  const script = SUNDAE_V3_PROTOCOL.blueprint.validators.find(
    (v) => v.title === "order.spend",
  )!.hash;
  const datum = utxo.output().datum()?.asInlineData();
  if (
    address.getNetworkId() !== CARDANO_NETWORK_ID ||
    payment?.type !== Core.CredentialType.ScriptHash ||
    payment.hash !== script ||
    !datum
  )
    throw new Error(
      "This output is not an inline SundaeSwap V3 order on the selected network.",
    );
  const fields = datum.asConstrPlutusData()?.getData();
  const ownerData = fields?.get(1).asConstrPlutusData();
  if (ownerData?.getAlternative() !== 0n)
    throw new Error("This order requires a different owner authorization.");
  const signer = DatumBuilderV3.getSignerKeyFromDatum(datum.toCbor());
  const ownAddress = Core.Address.fromBech32(owner);
  const credentials = [
    ownAddress.getProps().paymentPart,
    ownAddress.asBase()?.getStakeCredential(),
  ];
  if (
    !credentials.some(
      (credential) =>
        credential?.type === Core.CredentialType.KeyHash &&
        credential.hash === signer,
    )
  )
    throw new Error("This order belongs to another wallet account.");
  const query = new DingoSundaeQueryProvider(blaze.provider);
  const composed = await new TxBuilderV3(blaze, query).cancel({
    utxo: { hash: match[1].toLowerCase(), index: Number(match[2]) },
    ownerAddress: owner,
  });
  return finish(blaze, api, owner, composed, assertCurrent);
}
