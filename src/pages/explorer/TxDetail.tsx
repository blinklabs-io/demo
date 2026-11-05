import {
  TransactionPassport,
  TransactionOutputs,
  TransactionInsights,
} from "../../components/explorer/TransactionInsights";
import { useTransactionInspection } from "../../lib/explorer/transaction";
import { CopyButton } from "../../components/explorer/CopyButton";
import { BlockHeaderVersion } from "../../components/explorer/BlockHeaderVersion";
import { TransactionFlow } from "../../components/chain/TransactionFlow";
import { useEffect, useRef, useState } from "react";
import { useParams } from "react-router";
import { Link } from "../../components/NetworkLink";
import { useQuery } from "@tanstack/react-query";
import { blockfrostFetch, BlockfrostError } from "../../lib/dingo/blockfrost";
import { Panel } from "../../components/explorer/Panel";
import { type AmountEntry } from "../../components/explorer/AdaAmount";
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
  tx_hash?: string;
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

function JsonQueryPanel({
  title,
  data,
  isLoading,
  error,
}: JsonQueryPanelProps) {
  return (
    <Panel title={title}>
      <QueryState hasData={data !== undefined} isLoading={isLoading} error={error}>
        {Array.isArray(data) && data.length === 0 ? (
          <p className="text-sm text-slate-500">
            No {title.toLowerCase()} recorded.
          </p>
        ) : data === undefined || data === null ? (
          <p className="text-sm text-slate-500">No data.</p>
        ) : (
          <details>
            <summary className="cursor-pointer text-sm text-sky-400">
              Show response data
            </summary>
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
  return <TxDetailBody key={hash} hash={hash} />;
}
function TxDetailBody({ hash }: { hash: string | undefined }) {
  const [technicalOpen, setTechnicalOpen] = useState(false);

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

  const tx = isNotFoundOnChain ? undefined : txQuery.data;

  const delegationsQuery = useQuery({
    queryKey: ["dingo", "tx", hash, "delegations"],
    queryFn: () =>
      blockfrostFetch<DelegationRow[]>(`/api/v0/txs/${hash}/delegations`),
    enabled: technicalOpen && Boolean(hash && tx && tx.delegation_count > 0),
  });

  const withdrawalsQuery = useQuery({
    queryKey: ["dingo", "tx", hash, "withdrawals"],
    queryFn: () =>
      blockfrostFetch<WithdrawalRow[]>(`/api/v0/txs/${hash}/withdrawals`),
    enabled: technicalOpen && Boolean(hash && tx && tx.withdrawal_count > 0),
  });

  const confirmedTxEnabled = Boolean(hash && tx && !isPending);
  const metadataQuery = useQuery({
    queryKey: ["dingo", "tx", hash, "metadata"],
    queryFn: () => blockfrostFetch<unknown[]>(`/api/v0/txs/${hash}/metadata`),
    enabled: confirmedTxEnabled && technicalOpen,
    retry: false,
  });
  const metadataCborQuery = useQuery({
    queryKey: ["dingo", "tx", hash, "metadata-cbor"],
    queryFn: () =>
      blockfrostFetch<unknown[]>(`/api/v0/txs/${hash}/metadata/cbor`),
    enabled: confirmedTxEnabled && technicalOpen,
    retry: false,
  });
  const transactionCborQuery = useQuery({
    queryKey: ["dingo", "tx", hash, "cbor"],
    queryFn: () =>
      blockfrostFetch<{ cbor: string }>(`/api/v0/txs/${hash}/cbor`),
    enabled: confirmedTxEnabled,
    retry: false,
  });
  const stakesQuery = useQuery({
    queryKey: ["dingo", "tx", hash, "stakes"],
    queryFn: () => blockfrostFetch<unknown[]>(`/api/v0/txs/${hash}/stakes`),
    enabled:
      confirmedTxEnabled &&
      technicalOpen &&
      (tx ? tx.stake_cert_count > 0 : false),
    retry: false,
  });
  const mirsQuery = useQuery({
    queryKey: ["dingo", "tx", hash, "mirs"],
    queryFn: () => blockfrostFetch<unknown[]>(`/api/v0/txs/${hash}/mirs`),
    enabled:
      confirmedTxEnabled &&
      technicalOpen &&
      (tx ? tx.mir_cert_count > 0 : false),
    retry: false,
  });
  const poolUpdatesQuery = useQuery({
    queryKey: ["dingo", "tx", hash, "pool-updates"],
    queryFn: () =>
      blockfrostFetch<unknown[]>(`/api/v0/txs/${hash}/pool_updates`),
    enabled:
      confirmedTxEnabled &&
      technicalOpen &&
      (tx ? tx.pool_update_count > 0 : false),
    retry: false,
  });
  const poolRetiresQuery = useQuery({
    queryKey: ["dingo", "tx", hash, "pool-retires"],
    queryFn: () =>
      blockfrostFetch<unknown[]>(`/api/v0/txs/${hash}/pool_retires`),
    enabled:
      confirmedTxEnabled &&
      technicalOpen &&
      (tx ? tx.pool_retire_count > 0 : false),
    retry: false,
  });
  const redeemersQuery = useQuery({
    queryKey: ["dingo", "tx", hash, "redeemers"],
    queryFn: () => blockfrostFetch<unknown[]>(`/api/v0/txs/${hash}/redeemers`),
    enabled:
      confirmedTxEnabled &&
      technicalOpen &&
      (tx ? tx.redeemer_count > 0 : false),
    retry: false,
  });
  const requiredSignersQuery = useQuery({
    queryKey: ["dingo", "tx", hash, "required-signers"],
    queryFn: () =>
      blockfrostFetch<unknown[]>(`/api/v0/txs/${hash}/required_signers`),
    enabled: confirmedTxEnabled && technicalOpen,
    retry: false,
  });

  const inspection = useTransactionInspection(
    transactionCborQuery.data?.cbor,
    tx?.hash,
  );
  if (isPending && pendingTx) {
    return (
      <div className="transaction-explorer">
        <section className="ti-passport">
          <div className="ti-passport-top">
            <span className="eyebrow">Live from Dingo’s mempool</span>
            <span className="ti-verdict pending">◷ Awaiting inclusion</span>
          </div>
          <div className="ti-passport-heading">
            <div>
              <h1>Waiting for a block.</h1>
              <p>
                This transaction has been observed in the mempool. Its ledger
                effects are not confirmed.
              </p>
            </div>
            <span className="ti-passport-emblem" aria-hidden="true">
              ≋
            </span>
          </div>
          <div className="ti-identifier">
            <code>{pendingTx.hash}</code>
            <CopyButton value={pendingTx.hash} label="transaction ID" />
          </div>
          <div className="ti-pending-flow">
            <div>
              <strong>{pendingTx.inputCount}</strong>
              <span>Spending inputs</span>
            </div>
            <b>→</b>
            <div className="ti-pending-core">
              MEMPOOL<small>Not confirmed</small>
            </div>
            <b>→</b>
            <div>
              <strong>{pendingTx.outputCount}</strong>
              <span>Planned outputs</span>
            </div>
          </div>
          <div className="ti-passport-metrics">
            <div>
              <strong>{formatAda(pendingTx.fee)}</strong>
              <span>Declared fee</span>
            </div>
            <div>
              <strong>{formatAda(pendingTx.totalOutputLovelace)}</strong>
              <span>Planned output ADA</span>
            </div>
          </div>
          <Link to="/explorer/mempool" className="experience-primary">
            Watch the mempool →
          </Link>
        </section>
      </div>
    );
  }

  return (
    <div className="transaction-explorer" key={hash}>
      <QueryState hasData={txQuery.data !== undefined}
        isLoading={txQuery.isLoading}
        error={txQuery.error}
        notFoundLabel="Transaction not found."
      >
        {tx && (
          <>
            <TransactionPassport
              record={tx}
              inspection={inspection?.data ?? undefined}
            />
            <div className="ti-context-actions">
              <span>
                Block header{" "}
                <BlockHeaderVersion hash={tx.block} slot={tx.slot} />
              </span>
              <div>
                {transactionCborQuery.data?.cbor && (
                  <Link
                    className="experience-primary"
                    to="/wallet/tools/transactions"
                    state={{ transactionCbor: transactionCborQuery.data.cbor }}
                  >
                    Open in transaction studio →
                  </Link>
                )}
              </div>
            </div>
          </>
        )}
      </QueryState>
      {tx && (
        <>
          <QueryState hasData={utxosQuery.data !== undefined} isLoading={utxosQuery.isLoading} error={utxosQuery.error}>
            {utxosQuery.data && (
              <>
                <TransactionFlow
                  summary={tx}
                  inputs={utxosQuery.data.inputs}
                  outputs={utxosQuery.data.outputs}
                  cbor={transactionCborQuery.data?.cbor}
                  error={transactionCborQuery.error}
                />
                <TransactionOutputs
                  transactionHash={tx.hash}
                  inputs={utxosQuery.data.inputs}
                  outputs={utxosQuery.data.outputs}
                  valid={tx.valid_contract}
                />
              </>
            )}
          </QueryState>
          <QueryState hasData={transactionCborQuery.data !== undefined}
            isLoading={transactionCborQuery.isLoading}
            error={transactionCborQuery.error}
          >
            {inspection?.error && (
              <Panel title="Detailed transaction view unavailable">
                <p className="ti-note">
                  {inspection.error} Dingo’s indexed records and serialized
                  transaction are still available below.
                </p>
              </Panel>
            )}
            {inspection?.data && (
              <TransactionInsights
                inspection={inspection.data}
                inputs={utxosQuery.data?.inputs}
                valid={tx.valid_contract}
              />
            )}
          </QueryState>
          <details
            className="detail-disclosure"
            onToggle={(event) => setTechnicalOpen(event.currentTarget.open)}
          >
            <summary>Technical records &amp; original CBOR</summary>
            {technicalOpen && (
              <>
                <JsonQueryPanel
                  title="Transaction record"
                  data={tx}
                  isLoading={false}
                  error={null}
                />
                <JsonQueryPanel
                  title="Input and output records"
                  data={utxosQuery.data}
                  isLoading={utxosQuery.isLoading}
                  error={utxosQuery.error}
                />
                {tx.delegation_count > 0 && (
                  <JsonQueryPanel
                    title="Delegations"
                    data={delegationsQuery.data}
                    isLoading={delegationsQuery.isLoading}
                    error={delegationsQuery.error}
                  />
                )}
                {tx.withdrawal_count > 0 && (
                  <JsonQueryPanel
                    title="Withdrawals"
                    data={withdrawalsQuery.data}
                    isLoading={withdrawalsQuery.isLoading}
                    error={withdrawalsQuery.error}
                  />
                )}
                {tx.stake_cert_count > 0 && (
                  <JsonQueryPanel
                    title="Stake certificates"
                    data={stakesQuery.data}
                    isLoading={stakesQuery.isLoading}
                    error={stakesQuery.error}
                  />
                )}
                {tx.mir_cert_count > 0 && (
                  <JsonQueryPanel
                    title="MIR certificates"
                    data={mirsQuery.data}
                    isLoading={mirsQuery.isLoading}
                    error={mirsQuery.error}
                  />
                )}
                {tx.pool_update_count > 0 && (
                  <JsonQueryPanel
                    title="Pool updates"
                    data={poolUpdatesQuery.data}
                    isLoading={poolUpdatesQuery.isLoading}
                    error={poolUpdatesQuery.error}
                  />
                )}
                {tx.pool_retire_count > 0 && (
                  <JsonQueryPanel
                    title="Pool retirements"
                    data={poolRetiresQuery.data}
                    isLoading={poolRetiresQuery.isLoading}
                    error={poolRetiresQuery.error}
                  />
                )}
                {tx.redeemer_count > 0 && (
                  <JsonQueryPanel
                    title="Redeemers"
                    data={redeemersQuery.data}
                    isLoading={redeemersQuery.isLoading}
                    error={redeemersQuery.error}
                  />
                )}
                <JsonQueryPanel
                  title="Transaction metadata"
                  data={metadataQuery.data}
                  isLoading={metadataQuery.isLoading}
                  error={metadataQuery.error}
                />
                <JsonQueryPanel
                  title="Metadata CBOR"
                  data={metadataCborQuery.data}
                  isLoading={metadataCborQuery.isLoading}
                  error={metadataCborQuery.error}
                />
                <JsonQueryPanel
                  title="Required signers"
                  data={requiredSignersQuery.data}
                  isLoading={requiredSignersQuery.isLoading}
                  error={requiredSignersQuery.error}
                />
                <JsonQueryPanel
                  title="Transaction CBOR"
                  data={transactionCborQuery.data?.cbor}
                  isLoading={transactionCborQuery.isLoading}
                  error={transactionCborQuery.error}
                />
              </>
            )}
          </details>
        </>
      )}
    </div>
  );
}
