import { ChainMark } from "../../components/explorer/ChainMark";
import { nativeTicker } from "../../lib/format";
import { OutputHistory } from "../../components/explorer/OutputHistory";
import { Metric } from "../../components/explorer/Visuals";
import { CopyButton } from "../../components/explorer/CopyButton";
import { compactAda } from "../../lib/visualFormat";
import { useParams } from "react-router";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { blockfrostFetch } from "../../lib/dingo/blockfrost";
import { Panel, Field } from "../../components/explorer/Panel";
import { HashLink } from "../../components/explorer/HashLink";
import {
  AdaAmount,
  type AmountEntry,
} from "../../components/explorer/AdaAmount";
import { QueryState } from "../../components/explorer/QueryState";
import { Pagination } from "../../components/explorer/Pagination";
import { YoursBadge } from "../../components/explorer/YoursBadge";

interface AddressResponse {
  address: string;
  amount: AmountEntry[];
  stake_address: string | null;
  type: string;
  script: boolean;
}

interface AddressUtxo {
  tx_hash: string;
  output_index: number;
  amount: AmountEntry[];
  data_hash: string | null;
  inline_datum: string | null;
  reference_script_hash: string | null;
}

interface AddressTransaction {
  tx_hash: string;
  block_height: number;
  block_time: number;
}

const PAGE_SIZE = 20;

export default function AddressDetail() {
  const { address } = useParams();
  // React Router reuses this component instance across navigations that
  // only change the :address param, so a plain useState here would leak
  // pagination from the previous address. Keying the state-holding inner
  // component by address forces a clean remount instead.
  return <AddressDetailContent key={address} address={address} />;
}

function AddressDetailContent({ address }: { address?: string }) {
  const [utxoPage, setUtxoPage] = useState(1);
  const [txPage, setTxPage] = useState(1);

  const summaryQuery = useQuery({
    queryKey: ["dingo", "address", address],
    queryFn: () =>
      blockfrostFetch<AddressResponse>(`/api/v0/addresses/${address}`),
    enabled: Boolean(address),
  });

  const utxosQuery = useQuery({
    queryKey: ["dingo", "address", address, "utxos", utxoPage],
    queryFn: () =>
      blockfrostFetch<AddressUtxo[]>(
        `/api/v0/addresses/${address}/utxos?page=${utxoPage}&count=${PAGE_SIZE}`,
      ),
    enabled: Boolean(address),
  });

  const txsQuery = useQuery({
    queryKey: ["dingo", "address", address, "transactions", txPage],
    queryFn: () =>
      blockfrostFetch<AddressTransaction[]>(
        `/api/v0/addresses/${address}/transactions?page=${txPage}&count=${PAGE_SIZE}&order=desc`,
      ),
    enabled: Boolean(address),
  });

  return (
    <div className="flex flex-col gap-4 detail-showcase">
      <header className="detail-header">
        <div className="detail-identity">
          {address && <span className="detail-mark"><ChainMark value={address} /></span>}
          <h1>
            Address <YoursBadge value={address} />
          </h1>
          {address && (
            <p className="detail-id">
              <code>{address}</code>
              <CopyButton value={address} label="address" />
            </p>
          )}
        </div>
      </header>
      <QueryState
        hasData={summaryQuery.data !== undefined}
        isLoading={summaryQuery.isLoading}
        error={summaryQuery.error}
        notFoundLabel="Address not found (no on-chain activity yet)."
      >
        {summaryQuery.data && (
          <>
            <div className="metric-grid">
              <Metric
                label={`${nativeTicker()} balance`}
                value={compactAda(
                  summaryQuery.data.amount.find(
                    (amount) => amount.unit === "lovelace",
                  )?.quantity ?? "0",
                )}
              />
              <Metric
                label="Native assets"
                value={
                  summaryQuery.data.amount.filter(
                    (amount) => amount.unit !== "lovelace",
                  ).length
                }
              />
              <Metric
                label="Controlled by"
                value={summaryQuery.data.script ? "Script" : "Payment key"}
                detail={summaryQuery.data.type}
              />
            </div>
            <Panel title="Balance">
              <div className="field-grid">
                <Field
                  label="Holdings"
                  value={<AdaAmount amount={summaryQuery.data.amount} />}
                />
                {summaryQuery.data.stake_address && (
                  <Field
                    label="Stake address"
                    value={
                      <HashLink
                        kind="account"
                        id={summaryQuery.data.stake_address}
                      />
                    }
                  />
                )}
              </div>
            </Panel>
          </>
        )}
      </QueryState>

      <Panel title="Unspent outputs">
        <QueryState hasData={utxosQuery.data !== undefined} isLoading={utxosQuery.isLoading} error={utxosQuery.error}>
          {utxosQuery.data?.length === 0 && (
            <p className="panel-empty">No unspent outputs.</p>
          )}
          {utxosQuery.data && utxosQuery.data.length > 0 && (
            <ul className="utxo-list">
              {utxosQuery.data.map((utxo) => (
                <li key={`${utxo.tx_hash}:${utxo.output_index}`}>
                  <div>
                    <HashLink kind="tx" id={utxo.tx_hash} />
                    <span>#{utxo.output_index}</span>
                  </div>
                  <AdaAmount amount={utxo.amount} assetLimit={3} />
                  {(utxo.data_hash ||
                    utxo.inline_datum ||
                    utxo.reference_script_hash) && (
                    <details>
                      <summary>Datum and script references</summary>
                      {utxo.data_hash && <p>Datum hash: {utxo.data_hash}</p>}
                      {utxo.inline_datum && (
                        <p>Inline datum: {utxo.inline_datum}</p>
                      )}
                      {utxo.reference_script_hash && (
                        <p>Reference script: {utxo.reference_script_hash}</p>
                      )}
                    </details>
                  )}
                </li>
              ))}
            </ul>
          )}
          <Pagination
            page={utxoPage}
            onPageChange={setUtxoPage}
            hasNextPage={(utxosQuery.data?.length ?? 0) === PAGE_SIZE}
          />
        </QueryState>
      </Panel>

      {address && <OutputHistory pattern={address} />}

      <Panel title="Transactions">
        <QueryState hasData={txsQuery.data !== undefined} isLoading={txsQuery.isLoading} error={txsQuery.error}>
          {txsQuery.data?.length === 0 && (
            <p className="panel-empty">No transactions yet.</p>
          )}
          {txsQuery.data && txsQuery.data.length > 0 && (
            <div className="overflow-x-auto">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Transaction</th>
                    <th className="num">Block</th>
                    <th>Time</th>
                  </tr>
                </thead>
                <tbody>
                  {txsQuery.data.map((tx) => (
                    <tr key={tx.tx_hash}>
                      <td>
                        <HashLink kind="tx" id={tx.tx_hash} />
                      </td>
                      <td className="num">{tx.block_height.toLocaleString()}</td>
                      <td>{new Date(tx.block_time * 1000).toLocaleString()}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <Pagination
            page={txPage}
            onPageChange={setTxPage}
            hasNextPage={(txsQuery.data?.length ?? 0) === PAGE_SIZE}
          />
        </QueryState>
      </Panel>
    </div>
  );
}
