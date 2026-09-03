import { useState } from "react";
import { Link } from "react-router";
import { useMutation } from "@tanstack/react-query";
import { Core } from "@blaze-cardano/sdk";
import { useWalletStore } from "../../stores/walletStore";
import { getBlaze } from "../../lib/dingo/blaze";
import { parseAdaToLovelace } from "../../lib/dingo/amount";

interface SendResult {
  txHash: string;
}

export default function WalletSend() {
  const status = useWalletStore((state) => state.status);
  const walletApi = useWalletStore((state) => state.walletApi);
  const refreshBalance = useWalletStore((state) => state.refreshBalance);
  const [recipient, setRecipient] = useState("");
  const [amount, setAmount] = useState("");

  const sendMutation = useMutation<SendResult, Error>({
    mutationFn: async () => {
      if (!walletApi) {
        throw new Error("Connect a wallet first.");
      }
      const lovelace = parseAdaToLovelace(amount);
      if (lovelace <= 0n) {
        throw new Error("Enter a positive ADA amount.");
      }
      let recipientAddress: Core.Address;
      try {
        recipientAddress = Core.Address.fromBech32(recipient.trim());
      } catch {
        throw new Error("Enter a valid bech32 address.");
      }

      const { blaze } = await getBlaze(walletApi);
      const tx = await blaze
        .newTransaction()
        .payLovelace(recipientAddress, lovelace)
        .complete();
      const signed = await blaze.signTransaction(tx);
      const txId = await blaze.submitTransaction(signed);
      return { txHash: txId.toString() };
    },
    onSuccess: () => {
      void refreshBalance();
    },
  });

  if (status !== "connected") {
    return (
      <div className="rounded-md border border-slate-800 p-6 text-center text-sm text-slate-400">
        Connect a wallet from the header to send ADA.
      </div>
    );
  }

  return (
    <div className="max-w-md">
      <h1 className="mb-4 text-lg font-semibold text-white">Send ADA</h1>
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
          <span className="text-slate-400">Amount (ADA)</span>
          <input
            value={amount}
            onChange={(event) => setAmount(event.target.value)}
            inputMode="decimal"
            placeholder="5"
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
        <p className="mt-3 text-sm text-emerald-400">
          Submitted.{" "}
          <Link
            to={`/explorer/tx/${sendMutation.data.txHash}`}
            className="underline"
          >
            View in Explorer
          </Link>
        </p>
      )}
    </div>
  );
}
