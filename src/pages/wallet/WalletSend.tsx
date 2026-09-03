import { useState } from "react";
import { Link } from "react-router";
import { useMutation } from "@tanstack/react-query";
import { Core } from "@blaze-cardano/sdk";
import { useWalletStore } from "../../stores/walletStore";
import { getBlaze } from "../../lib/dingo/blaze";
import { parseAdaToLovelace, parseAssetAmount } from "../../lib/dingo/amount";
import { formatAda } from "../../lib/format";

interface SendResult {
  txHash: string;
  note?: string;
}

const ADA_OPTION = "ada";

function assetLabel(assetId: string): string {
  try {
    const name = Core.AssetName.toUTF8(Core.AssetId.getAssetName(assetId), true);
    return name || `${assetId.slice(0, 8)}…`;
  } catch {
    return `${assetId.slice(0, 8)}…`;
  }
}

export default function WalletSend() {
  const status = useWalletStore((state) => state.status);
  const walletApi = useWalletStore((state) => state.walletApi);
  const tokens = useWalletStore((state) => state.tokens);
  const refreshBalance = useWalletStore((state) => state.refreshBalance);
  const [recipient, setRecipient] = useState("");
  const [amount, setAmount] = useState("");
  const [selectedAsset, setSelectedAsset] = useState(ADA_OPTION);

  const sendMutation = useMutation<SendResult, Error>({
    mutationFn: async () => {
      if (!walletApi) {
        throw new Error("Connect a wallet first.");
      }
      let recipientAddress: Core.Address;
      try {
        recipientAddress = Core.Address.fromBech32(recipient.trim());
      } catch {
        throw new Error("Enter a valid bech32 address.");
      }
      const recipientBech32 = recipientAddress.toBech32();
      const { blaze } = await getBlaze(walletApi);

      if (selectedAsset === ADA_OPTION) {
        const lovelace = parseAdaToLovelace(amount);
        if (lovelace <= 0n) {
          throw new Error("Enter a positive ADA amount.");
        }
        const tx = await blaze
          .newTransaction()
          .payLovelace(recipientAddress, lovelace)
          .complete();

        // Cardano enforces a minimum ADA per output (min-UTxO). Blaze
        // silently raises an output below that floor rather than failing -
        // so verify the built output actually pays what the user typed
        // before asking them to sign anything else.
        const actualOutput = tx
          .body()
          .outputs()
          .find((output) => output.address().toBech32() === recipientBech32);
        const actualLovelace = actualOutput?.amount().coin() ?? 0n;
        if (actualLovelace !== lovelace) {
          throw new Error(
            `${lovelace} lovelace is below Cardano's minimum ADA per output; the recipient would actually receive ${actualLovelace} lovelace. Enter at least ${actualLovelace} lovelace (${(Number(actualLovelace) / 1_000_000).toFixed(6)} ADA).`,
          );
        }

        const signed = await blaze.signTransaction(tx);
        // Submit through Dingo (the provider), not the wallet extension's
        // own backend - this is a Dingo showcase, and it also keeps a
        // testnet-only tx from reaching a different network via the
        // wallet's own submission path.
        const txId = await blaze.submitTransaction(signed, true);
        return { txHash: txId.toString() };
      }

      const held = tokens.find((token) => token.assetId === selectedAsset);
      if (!held) {
        throw new Error("Selected asset is no longer in your wallet.");
      }
      // No decimals metadata is available from the wallet balance alone
      // (unlike ADA, a native asset carries no inherent decimal count
      // on-chain) - amounts are entered and shown in raw base units.
      const quantity = parseAssetAmount(amount, 0, assetLabel(selectedAsset));
      if (quantity <= 0n) {
        throw new Error("Enter a positive amount.");
      }
      if (quantity > held.quantity) {
        throw new Error(
          `You only hold ${held.quantity} raw unit(s) of this asset.`,
        );
      }

      const assetMap = new Map([[Core.AssetId(selectedAsset), quantity]]);
      // coin starts at 0 and Blaze raises it to the minimum ADA a UTxO
      // carrying this token bundle requires - unlike the plain-ADA case
      // above, that's the correct behavior here, not a silent surprise,
      // since no ADA amount was specified by the user for this output.
      const tx = await blaze
        .newTransaction()
        .payAssets(recipientAddress, new Core.Value(0n, assetMap))
        .complete();

      const actualOutput = tx
        .body()
        .outputs()
        .find((output) => output.address().toBech32() === recipientBech32);
      const actualQuantity =
        actualOutput?.amount().multiasset()?.get(Core.AssetId(selectedAsset)) ??
        0n;
      if (actualQuantity !== quantity) {
        throw new Error(
          `Built transaction would send ${actualQuantity} units instead of ${quantity} - refusing to sign.`,
        );
      }
      const requiredLovelace = actualOutput?.amount().coin() ?? 0n;

      const signed = await blaze.signTransaction(tx);
      const txId = await blaze.submitTransaction(signed, true);
      return {
        txHash: txId.toString(),
        note: `Also sent ${formatAda(requiredLovelace)}, the minimum a UTxO carrying this token requires.`,
      };
    },
    onSuccess: () => {
      void refreshBalance();
    },
  });

  if (status !== "connected") {
    return (
      <div className="rounded-md border border-slate-800 p-6 text-center text-sm text-slate-400">
        Connect a wallet from the header to send ADA or a token.
      </div>
    );
  }

  return (
    <div className="max-w-md">
      <h1 className="mb-4 text-lg font-semibold text-white">Send</h1>
      <form
        onSubmit={(event) => {
          event.preventDefault();
          sendMutation.reset();
          sendMutation.mutate();
        }}
        className="flex flex-col gap-3"
      >
        <label className="flex flex-col gap-1 text-sm">
          <span className="text-slate-400">Recipient address</span>
          <input
            value={recipient}
            onChange={(event) => setRecipient(event.target.value)}
            placeholder="addr_test1..."
            className="rounded-md border border-slate-700 bg-slate-900 px-3 py-2 text-slate-100 placeholder:text-slate-500 focus:border-slate-500 focus:outline-none"
          />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          <span className="text-slate-400">Asset</span>
          <select
            value={selectedAsset}
            onChange={(event) => setSelectedAsset(event.target.value)}
            className="rounded-md border border-slate-700 bg-slate-900 px-3 py-2 text-slate-100 focus:border-slate-500 focus:outline-none"
          >
            <option value={ADA_OPTION}>ADA</option>
            {tokens.map((token) => (
              <option key={token.assetId} value={token.assetId}>
                {assetLabel(token.assetId)} ({token.quantity} raw units held)
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-sm">
          <span className="text-slate-400">
            Amount {selectedAsset === ADA_OPTION ? "(ADA)" : "(raw units)"}
          </span>
          <input
            value={amount}
            onChange={(event) => setAmount(event.target.value)}
            inputMode="decimal"
            placeholder={selectedAsset === ADA_OPTION ? "5" : "1"}
            className="rounded-md border border-slate-700 bg-slate-900 px-3 py-2 text-slate-100 placeholder:text-slate-500 focus:border-slate-500 focus:outline-none"
          />
        </label>
        <button
          type="submit"
          disabled={sendMutation.isPending}
          className="rounded-md border border-slate-700 bg-slate-900 px-4 py-2 text-sm text-slate-100 hover:border-slate-500 disabled:opacity-50"
        >
          {sendMutation.isPending ? "Building, signing, submitting…" : "Send"}
        </button>
      </form>

      {sendMutation.isError && (
        <p className="mt-3 text-sm text-red-400">
          {sendMutation.error.message}
        </p>
      )}
      {sendMutation.isSuccess && (
        <div className="mt-3 text-sm text-emerald-400">
          <p>
            Submitted.{" "}
            <Link
              to={`/explorer/tx/${sendMutation.data.txHash}`}
              className="underline"
            >
              View in Explorer
            </Link>
          </p>
          {sendMutation.data.note && (
            <p className="mt-1 text-xs text-slate-500">
              {sendMutation.data.note}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
