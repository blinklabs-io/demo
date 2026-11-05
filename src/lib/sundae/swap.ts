import { assertPreviewSundae } from "./protocol";
import { governanceError } from "../dingo/governanceVote";
import { assertWalletSession } from "../dingo/walletSession";
import { Blaze, Core, type Wallet } from "@blaze-cardano/sdk";
import { AssetAmount } from "@sundaeswap/asset";
import {
  ADA_METADATA,
  EDatumType,
  ESwapType,
  TxBuilderV3,
  SundaeUtils,
  type IPoolData,
  type IPoolDataAsset,
} from "@sundaeswap/core";
import type { DingoProvider } from "../dingo/utxorpc/provider";
import { parseAssetAmount } from "../dingo/amount";
import type { DingoSundaeQueryProvider } from "./dingoQueryProvider";
import { offeredAssetForDirection, poolHasAda } from "./pricing";

export type SwapDirection = "adaToToken" | "tokenToAda";

export type BuildSwapArgs = {
  blaze: Blaze<DingoProvider, Wallet>;
  queryProvider: DingoSundaeQueryProvider;
  pool: IPoolData;
  amount: string;
  direction: SwapDirection;
  slippagePercent: string;
  assertConnection: () => void;
};

export type BuiltSwap = {
  unsignedCbor: string;
  signedCbor?: string;
  txFee: bigint;
  deposit: bigint;
  scooperFee: bigint;
  minimumReceived: bigint;
  signAndSubmit(): Promise<string>;
};

export async function buildSwapOrder({
  blaze,
  queryProvider,
  pool,
  amount,
  direction,
  slippagePercent,
  assertConnection,
}: BuildSwapArgs): Promise<BuiltSwap> {
  assertPreviewSundae();
  try {
    await assertWalletSession(blaze.wallet, assertConnection);
    const changeAddress = (await blaze.wallet.getChangeAddress()).toBech32();
    assertConnection();
    if (!poolHasAda(pool)) {
      throw new Error("The selected pool is not an ADA pair.");
    }
    const suppliedAsset = offeredAssetForDirection(pool, direction);
    const suppliedAmount = parseAssetAmount(
      amount,
      suppliedAsset.decimals ?? 0,
      labelForAsset(suppliedAsset),
    );
    if (suppliedAmount <= 0n) {
      throw new Error(
        `Enter a positive ${labelForAsset(suppliedAsset)} amount.`,
      );
    }

    const slippage = Number(slippagePercent) / 100;
    if (!Number.isFinite(slippage) || slippage < 0 || slippage > 0.5) {
      throw new Error("Slippage must be between 0 and 50 percent.");
    }

    const supplied = new AssetAmount(suppliedAmount, suppliedAsset);
    const minimum = SundaeUtils.getMinReceivableFromSlippage(
      pool,
      supplied,
      slippage,
    );
    if (minimum.amount <= 0n)
      throw new Error("Minimum received rounds to zero. Increase the amount.");
    const builder = new TxBuilderV3(blaze, queryProvider);
    const composed = await builder.swap({
      pool,
      suppliedAsset: supplied,
      swapType: {
        type: ESwapType.LIMIT,
        minReceivable: minimum,
      },
      ownerAddress: changeAddress,
      orderAddresses: {
        DestinationAddress: {
          address: changeAddress,
          datum: {
            type: EDatumType.NONE,
          },
        },
      },
    });

    assertConnection();
    const built = await composed.build();
    assertConnection();
    const txFee = BigInt(built.builtTx.body().fee()?.toString() ?? "0");

    return {
      unsignedCbor: built.cbor,
      txFee,
      deposit: composed.fees.deposit.amount,
      scooperFee: composed.fees.scooperFee.amount,
      minimumReceived: minimum.amount,
      async signAndSubmit() {
        try {
          const assertAccount = async () => {
            await assertWalletSession(blaze.wallet, assertConnection);
            const currentAddress = await blaze.wallet.getChangeAddress();
            assertConnection();
            if (currentAddress.toBech32() !== changeAddress)
              throw new Error(
                "Wallet account changed. Build and review a new order.",
              );
          };
          await assertAccount();
          const signed = await built.sign();
          await assertAccount();
          const tx = Core.Transaction.fromCbor(Core.TxCBOR(signed.cbor));
          const txId = await blaze.provider.postTransactionToChain(tx);
          return txId.toString();
        } catch (error) {
          throw governanceError(
            error,
            "Unable to sign or submit the swap order.",
          );
        }
      },
    };
  } catch (error) {
    throw governanceError(error, "Unable to build the swap order.");
  }
}

function labelForAsset(asset: IPoolDataAsset): string {
  if (asset.assetId === ADA_METADATA.assetId) {
    return "ADA";
  }
  return "token";
}
