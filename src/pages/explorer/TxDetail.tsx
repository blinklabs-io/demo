import { useEffect, useRef } from "react";
import { useParams } from "react-router";
import { useQuery } from "@tanstack/react-query";
import { blockfrostFetch, BlockfrostError } from "../../lib/dingo/blockfrost";
import { Panel, Field } from "../../components/explorer/Panel";
import { HashLink } from "../../components/explorer/HashLink";
import { AdaAmount, type AmountEntry } from "../../components/explorer/AdaAmount";
import { QueryState } from "../../components/explorer/QueryState";
import { formatAda } from "../../lib/format";
import { useMempoolStore } from "../../stores/mempoolStore";

interface TransactionResponse {
  hash: string;
  block: string;
  block_height: number;
  block_time: number;
  slot: number;
  index: number;
  fees: string;
  deposit: string;
  size: number;
  valid_contract: boolean;
  delegation_count: number;
  withdrawal_count: number;
  redeemer_count: number;
  stake_cert_count: number;
  pool_update_count: number;
  pool_retire_count: number;
}

interface TxUtxo {
  address: string;
  tx_hash: string;
  output_index: number;
  amount: AmountEntry[];
  collateral: boolean;
  reference?: boolean;
}

interface TransactionUtxosResponse {
  hash: string;
  inputs: TxUtxo[];
  outputs: TxUtxo[];
}

interface DelegationRow {
  address: string;
  pool_id: string;
  active_epoch: number;
}

interface WithdrawalRow {
  address: string;
  amount: string;
}

export default function TxDetail() {
  const { hash } = useParams();

  const txQuery = useQuery({
    queryKey: ["dingo", "tx", hash],
    queryFn: () => blockfrostFetch<TransactionResponse>(`/api/v0/txs/${hash}`),
    enabled: Boolean(hash),
    retry: (failureCount, error) =>
      error instanceof BlockfrostError && error.status === 404
        ? false
        : failureCount < 2,
  });

  // Blockfrost only knows about confirmed (indexed) transactions. A hash
  // that 404s there might just not exist yet, or might be sitting in
  // Dingo's mempool - the live mempool feed (started once in AppShell) is
  // checked as a fallback before treating it as genuinely not found.
  const pendingTx = useMempoolStore((state) =>
    hash ? state.pendingTxs.get(hash) : undefined,
  );
  const isNotFoundOnChain =
    txQuery.error instanceof BlockfrostError && txQuery.error.status === 404;
  const isPending = isNotFoundOnChain && Boolean(pendingTx);
  const wasPending = useRef(false);
  const { refetch } = txQuery;

  useEffect(() => {
    if (wasPending.current && !isPending && isNotFoundOnChain) {
      void refetch();
    }
    wasPending.current = isPending;
  }, [isNotFoundOnChain, isPending, refetch]);

  const utxosQuery = useQuery({
    queryKey: ["dingo", "tx", hash, "utxos"],
    queryFn: () =>
      blockfrostFetch<TransactionUtxosResponse>(`/api/v0/txs/${hash}/utxos`),
    enabled: Boolean(hash) && !isPending,
  });

  const tx = txQuery.data;

  const delegationsQuery = useQuery({
    queryKey: ["dingo", "tx", hash, "delegations"],
    queryFn: () =>
      blockfrostFetch<DelegationRow[]>(`/api/v0/txs/${hash}/delegations`),
    enabled: Boolean(hash && tx && tx.delegation_count > 0),
  });

  const withdrawalsQuery = useQuery({
    queryKey: ["dingo", "tx", hash, "withdrawals"],
    queryFn: () =>
      blockfrostFetch<WithdrawalRow[]>(`/api/v0/txs/${hash}/withdrawals`),
    enabled: Boolean(hash && tx && tx.withdrawal_count > 0),
  });

  if (isPending && pendingTx) {
    return (
      <div className="flex flex-col gap-4">
        <Panel
          title={
            <span className="flex items-center gap-2">
              Transaction
              <span className="rounded bg-amber-950 px-1.5 py-0.5 text-xs text-amber-300">
                pending
              </span>
            </span>
          }
        >
          <p className="mb-3 text-xs text-slate-500">
            Not yet in a block - this is decoded from the raw transaction
            bytes in Dingo's mempool, not from Blockfrost. Full details
            (addresses, exact outputs) become available here once it's
            confirmed.
          </p>
          <div>
            <Field label="Hash" value={pendingTx.hash} />
            <Field label="Inputs" value={pendingTx.inputCount} />
            <Field label="Outputs" value={pendingTx.outputCount} />
            <Field
              label="Total output"
              value={formatAda(pendingTx.totalOutputLovelace)}
            />
            <Field label="Fee" value={formatAda(pendingTx.fee)} />
          </div>
        </Panel>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <Panel title="Transaction">
        <QueryState
          isLoading={txQuery.isLoading}
          error={txQuery.error}
          notFoundLabel="Transaction not found."
        >
          {tx && (
            <div>
              <Field label="Hash" value={tx.hash} />
              <Field label="Block" value={<HashLink kind="block" id={tx.block} full />} />
              <Field label="Block height" value={tx.block_height} />
              <Field
                label="Time"
                value={new Date(tx.block_time * 1000).toLocaleString()}
              />
              <Field label="Fees" value={formatAda(BigInt(tx.fees))} />
              <Field label="Deposit" value={formatAda(BigInt(tx.deposit))} />
              <Field label="Size" value={`${tx.size} bytes`} />
              <Field
                label="Valid"
                value={tx.valid_contract ? "Yes" : "No (script failed)"}
              />
            </div>
          )}
        </QueryState>
      </Panel>

      <Panel title="UTxOs">
        <QueryState isLoading={utxosQuery.isLoading} error={utxosQuery.error}>
          {utxosQuery.data && (
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <h3 className="mb-1 text-xs uppercase tracking-wide text-slate-500">
                  Inputs
                </h3>
                <ul className="flex flex-col gap-2">
                  {utxosQuery.data.inputs.map((utxo, index) => (
                    <li
                      key={`${utxo.tx_hash}:${utxo.output_index}:${index}`}
                      className="rounded border border-slate-800 p-2 text-sm"
                    >
                      <div className="flex items-center gap-2">
                        <HashLink kind="address" id={utxo.address} visible={10} />
                        {utxo.reference && (
                          <span
                            className="rounded bg-sky-950 px-1.5 py-0.5 text-xs text-sky-300"
                            title="Reference input: read by a script, never spent by this transaction."
                          >
                            reference
                          </span>
                        )}
                        {utxo.collateral && (
                          <span
                            className="rounded bg-amber-950 px-1.5 py-0.5 text-xs text-amber-300"
                            title="Collateral input: only consumed if script validation for this transaction fails."
                          >
                            collateral
                          </span>
                        )}
                      </div>
                      <div className="mt-1">
                        <AdaAmount amount={utxo.amount} />
                      </div>
                    </li>
                  ))}
                </ul>
              </div>
              <div>
                <h3 className="mb-1 text-xs uppercase tracking-wide text-slate-500">
                  Outputs
                </h3>
                <ul className="flex flex-col gap-2">
                  {utxosQuery.data.outputs.map((utxo) => (
                    <li
                      key={utxo.output_index}
                      className="rounded border border-slate-800 p-2 text-sm"
                    >
                      <HashLink kind="address" id={utxo.address} visible={10} />
                      <div className="mt-1">
                        <AdaAmount amount={utxo.amount} />
                      </div>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          )}
        </QueryState>
      </Panel>

      {tx && tx.delegation_count > 0 && (
        <Panel title="Delegations">
          <QueryState
            isLoading={delegationsQuery.isLoading}
            error={delegationsQuery.error}
          >
            <ul className="flex flex-col gap-1 text-sm">
              {delegationsQuery.data?.map((row, index) => (
                <li key={index}>
                  <HashLink kind="account" id={row.address} visible={10} /> →{" "}
                  <HashLink kind="pool" id={row.pool_id} visible={10} /> (epoch{" "}
                  {row.active_epoch})
                </li>
              ))}
            </ul>
          </QueryState>
        </Panel>
      )}

      {tx && tx.withdrawal_count > 0 && (
        <Panel title="Withdrawals">
          <QueryState
            isLoading={withdrawalsQuery.isLoading}
            error={withdrawalsQuery.error}
          >
            <ul className="flex flex-col gap-1 text-sm">
              {withdrawalsQuery.data?.map((row, index) => (
                <li key={index}>
                  <HashLink kind="account" id={row.address} visible={10} /> —{" "}
                  {formatAda(BigInt(row.amount))}
                </li>
              ))}
            </ul>
          </QueryState>
        </Panel>
      )}
    </div>
  );
}
