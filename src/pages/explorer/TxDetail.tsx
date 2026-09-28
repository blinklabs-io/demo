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
  invalid_before: string | null;
  invalid_hereafter: string | null;
  output_amount: AmountEntry[];
  hash: string;
  block: string;
  block_height: number;
  block_time: number;
  slot: number;
  index: number;
  fees: string;
  deposit: string;
  treasury_donation: string;
  size: number;
  valid_contract: boolean;
  delegation_count: number;
  withdrawal_count: number;
  mir_cert_count: number;
  redeemer_count: number;
  stake_cert_count: number;
  pool_update_count: number;
  pool_retire_count: number;
  asset_mint_or_burn_count: number;
}

interface TxUtxo {
  address: string;
  tx_hash: string;
  output_index: number;
  amount: AmountEntry[];
  collateral: boolean;
  reference?: boolean;
  data_hash?: string | null;
  inline_datum?: string | null;
  reference_script_hash?: string | null;
  consumed_by_tx?: string | null;
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

interface JsonQueryPanelProps {
  title: string;
  data: unknown;
  isLoading: boolean;
  error: unknown;
}

function JsonQueryPanel({ title, data, isLoading, error }: JsonQueryPanelProps) {
  return (
    <Panel title={title}>
      <QueryState isLoading={isLoading} error={error}>
        {Array.isArray(data) && data.length === 0 ? (
          <p className="text-sm text-slate-500">No {title.toLowerCase()} recorded.</p>
        ) : data === undefined || data === null ? (
          <p className="text-sm text-slate-500">No data.</p>
        ) : (
          <details>
            <summary className="cursor-pointer text-sm text-sky-400">Show response data</summary>
            <pre className="mt-2 max-h-96 overflow-auto whitespace-pre-wrap break-all rounded border border-slate-800 bg-slate-950 p-3 text-xs text-slate-300">
              {JSON.stringify(data, null, 2)}
            </pre>
          </details>
        )}
      </QueryState>
    </Panel>
  );
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
  const pendingState = useRef({
    hash,
    wasSeen: false,
    confirmationRefetched: false,
  });
  const { refetch } = txQuery;

  useEffect(() => {
    if (pendingState.current.hash !== hash) {
      pendingState.current = {
        hash,
        wasSeen: false,
        confirmationRefetched: false,
      };
    }
    if (pendingTx) {
      pendingState.current.wasSeen = true;
      pendingState.current.confirmationRefetched = false;
    }
    if (
      !txQuery.isLoading &&
      isNotFoundOnChain &&
      !pendingTx &&
      pendingState.current.wasSeen &&
      !pendingState.current.confirmationRefetched
    ) {
      pendingState.current.confirmationRefetched = true;
      void refetch();
    }
  }, [hash, isNotFoundOnChain, pendingTx, refetch, txQuery.isLoading]);

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

  const confirmedTxEnabled = Boolean(hash && tx && !isPending);
  const metadataQuery = useQuery({
    queryKey: ["dingo", "tx", hash, "metadata"],
    queryFn: () => blockfrostFetch<unknown[]>(`/api/v0/txs/${hash}/metadata`),
    enabled: confirmedTxEnabled,
    retry: false,
  });
  const metadataCborQuery = useQuery({
    queryKey: ["dingo", "tx", hash, "metadata-cbor"],
    queryFn: () => blockfrostFetch<unknown[]>(`/api/v0/txs/${hash}/metadata/cbor`),
    enabled: confirmedTxEnabled,
    retry: false,
  });
  const transactionCborQuery = useQuery({
    queryKey: ["dingo", "tx", hash, "cbor"],
    queryFn: () => blockfrostFetch<{ cbor: string }>(`/api/v0/txs/${hash}/cbor`),
    enabled: confirmedTxEnabled,
    retry: false,
  });
  const stakesQuery = useQuery({
    queryKey: ["dingo", "tx", hash, "stakes"],
    queryFn: () => blockfrostFetch<unknown[]>(`/api/v0/txs/${hash}/stakes`),
    enabled: confirmedTxEnabled && (tx ? tx.stake_cert_count > 0 : false),
    retry: false,
  });
  const mirsQuery = useQuery({
    queryKey: ["dingo", "tx", hash, "mirs"],
    queryFn: () => blockfrostFetch<unknown[]>(`/api/v0/txs/${hash}/mirs`),
    enabled: confirmedTxEnabled && (tx ? tx.mir_cert_count > 0 : false),
    retry: false,
  });
  const poolUpdatesQuery = useQuery({
    queryKey: ["dingo", "tx", hash, "pool-updates"],
    queryFn: () => blockfrostFetch<unknown[]>(`/api/v0/txs/${hash}/pool_updates`),
    enabled: confirmedTxEnabled && (tx ? tx.pool_update_count > 0 : false),
    retry: false,
  });
  const poolRetiresQuery = useQuery({
    queryKey: ["dingo", "tx", hash, "pool-retires"],
    queryFn: () => blockfrostFetch<unknown[]>(`/api/v0/txs/${hash}/pool_retires`),
    enabled: confirmedTxEnabled && (tx ? tx.pool_retire_count > 0 : false),
    retry: false,
  });
  const redeemersQuery = useQuery({
    queryKey: ["dingo", "tx", hash, "redeemers"],
    queryFn: () => blockfrostFetch<unknown[]>(`/api/v0/txs/${hash}/redeemers`),
    enabled: confirmedTxEnabled && (tx ? tx.redeemer_count > 0 : false),
    retry: false,
  });
  const requiredSignersQuery = useQuery({
    queryKey: ["dingo", "tx", hash, "required-signers"],
    queryFn: () => blockfrostFetch<unknown[]>(`/api/v0/txs/${hash}/required_signers`),
    enabled: confirmedTxEnabled,
    retry: false,
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
              <Field label="Treasury donation" value={`${formatAda(BigInt(tx.treasury_donation))} ADA`} />
              <Field label="Size" value={`${tx.size} bytes`} />
              <Field label="Slot" value={tx.slot} />
              <Field label="Index in block" value={tx.index} />
              <Field
                label="Valid"
                value={tx.valid_contract ? "Yes" : "No (script failed)"}
              />
              {tx.invalid_before && <Field label="Valid after slot" value={tx.invalid_before} />}
              {tx.invalid_hereafter && <Field label="Valid through slot" value={tx.invalid_hereafter} />}
              <Field label="Total output" value={<AdaAmount amount={tx.output_amount} />} />
              <Field label="Mint/burn assets" value={tx.asset_mint_or_burn_count} />
              <Field label="Redeemers" value={tx.redeemer_count} />
              <Field label="Stake certificates" value={tx.stake_cert_count} />
              <Field label="Pool updates / retirements" value={`${tx.pool_update_count} / ${tx.pool_retire_count}`} />
              <Field label="MIR certificates" value={tx.mir_cert_count} />
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
                      <div className="mt-1 text-xs text-slate-500">
                        Input {utxo.tx_hash}#{utxo.output_index}
                      </div>
                      <div className="mt-1">
                        <AdaAmount amount={utxo.amount} />
                      </div>
                      {(utxo.data_hash || utxo.inline_datum || utxo.reference_script_hash) && (
                        <details className="mt-2 text-xs text-slate-500">
                          <summary className="cursor-pointer">Datum and script references</summary>
                          {utxo.data_hash && <p className="mt-1 break-all">Datum hash: {utxo.data_hash}</p>}
                          {utxo.inline_datum && <p className="mt-1 break-all">Inline datum: {utxo.inline_datum}</p>}
                          {utxo.reference_script_hash && <p className="mt-1 break-all">Reference script: {utxo.reference_script_hash}</p>}
                        </details>
                      )}
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
                      <div className="mt-1 text-xs text-slate-500">Output #{utxo.output_index}</div>
                      <div className="mt-1">
                        <AdaAmount amount={utxo.amount} />
                      </div>
                      {utxo.consumed_by_tx && (
                        <p className="mt-1 text-xs text-slate-500">
                          Spent by <HashLink kind="tx" id={utxo.consumed_by_tx} visible={10} />
                        </p>
                      )}
                      {(utxo.data_hash || utxo.inline_datum || utxo.reference_script_hash) && (
                        <details className="mt-2 text-xs text-slate-500">
                          <summary className="cursor-pointer">Datum and script references</summary>
                          {utxo.data_hash && <p className="mt-1 break-all">Datum hash: {utxo.data_hash}</p>}
                          {utxo.inline_datum && <p className="mt-1 break-all">Inline datum: {utxo.inline_datum}</p>}
                          {utxo.reference_script_hash && <p className="mt-1 break-all">Reference script: {utxo.reference_script_hash}</p>}
                        </details>
                      )}
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

      {tx && tx.stake_cert_count > 0 && <JsonQueryPanel title="Stake certificates" data={stakesQuery.data} isLoading={stakesQuery.isLoading} error={stakesQuery.error} />}
      {tx && tx.mir_cert_count > 0 && <JsonQueryPanel title="MIR certificates" data={mirsQuery.data} isLoading={mirsQuery.isLoading} error={mirsQuery.error} />}
      {tx && tx.pool_update_count > 0 && <JsonQueryPanel title="Pool updates" data={poolUpdatesQuery.data} isLoading={poolUpdatesQuery.isLoading} error={poolUpdatesQuery.error} />}
      {tx && tx.pool_retire_count > 0 && <JsonQueryPanel title="Pool retirements" data={poolRetiresQuery.data} isLoading={poolRetiresQuery.isLoading} error={poolRetiresQuery.error} />}
      {tx && tx.redeemer_count > 0 && <JsonQueryPanel title="Redeemers" data={redeemersQuery.data} isLoading={redeemersQuery.isLoading} error={redeemersQuery.error} />}
      {tx && (
        <>
          <JsonQueryPanel title="Transaction metadata" data={metadataQuery.data} isLoading={metadataQuery.isLoading} error={metadataQuery.error} />
          <JsonQueryPanel title="Metadata CBOR" data={metadataCborQuery.data} isLoading={metadataCborQuery.isLoading} error={metadataCborQuery.error} />
          <JsonQueryPanel title="Required signers" data={requiredSignersQuery.data} isLoading={requiredSignersQuery.isLoading} error={requiredSignersQuery.error} />
          <JsonQueryPanel title="Transaction CBOR" data={transactionCborQuery.data?.cbor} isLoading={transactionCborQuery.isLoading} error={transactionCborQuery.error} />
        </>
      )}
    </div>
  );
}
