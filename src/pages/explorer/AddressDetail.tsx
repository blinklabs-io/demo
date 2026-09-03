import { useParams } from "react-router";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { blockfrostFetch } from "../../lib/dingo/blockfrost";
import { Panel, Field } from "../../components/explorer/Panel";
import { HashLink } from "../../components/explorer/HashLink";
import { AdaAmount, type AmountEntry } from "../../components/explorer/AdaAmount";
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
}

interface AddressTransaction {
  tx_hash: string;
  block_height: number;
  block_time: number;
}

const PAGE_SIZE = 20;

export default function AddressDetail() {
  const { address } = useParams();
  const [utxoPage, setUtxoPage] = useState(1);
  const [txPage, setTxPage] = useState(1);

  const summaryQuery = useQuery({
    queryKey: ["dingo", "address", address],
    queryFn: () => blockfrostFetch<AddressResponse>(`/api/v0/addresses/${address}`),
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
    <div className="flex flex-col gap-4">
      <Panel
        title={
          <>
            Address <YoursBadge value={address} />
          </>
        }
      >
        <QueryState
          isLoading={summaryQuery.isLoading}
          error={summaryQuery.error}
          notFoundLabel="Address not found (no on-chain activity yet)."
        >
          {summaryQuery.data && (
            <div>
              <Field label="Address" value={summaryQuery.data.address} />
              <Field
                label="Balance"
                value={<AdaAmount amount={summaryQuery.data.amount} />}
              />
              <Field label="Type" value={summaryQuery.data.type} />
              <Field
                label="Script"
                value={summaryQuery.data.script ? "Yes" : "No"}
              />
              <Field
                label="Stake address"
                value={
                  summaryQuery.data.stake_address ? (
                    <HashLink
                      kind="account"
                      id={summaryQuery.data.stake_address}
                      visible={10}
                    />
                  ) : (
                    "—"
                  )
                }
              />
            </div>
          )}
        </QueryState>
      </Panel>

      <Panel title="UTxOs">
        <QueryState isLoading={utxosQuery.isLoading} error={utxosQuery.error}>
          {utxosQuery.data?.length === 0 && (
            <p className="text-sm text-slate-500">No unspent UTxOs.</p>
          )}
          <ul className="flex flex-col gap-2">
            {utxosQuery.data?.map((utxo) => (
              <li
                key={`${utxo.tx_hash}:${utxo.output_index}`}
                className="rounded border border-slate-800 p-2 text-sm"
              >
                <HashLink kind="tx" id={utxo.tx_hash} visible={12} />
                <span className="text-slate-500">#{utxo.output_index}</span>
                <div className="mt-1">
                  <AdaAmount amount={utxo.amount} />
                </div>
              </li>
            ))}
          </ul>
          <Pagination
            page={utxoPage}
            onPageChange={setUtxoPage}
            hasNextPage={(utxosQuery.data?.length ?? 0) === PAGE_SIZE}
          />
        </QueryState>
      </Panel>

      <Panel title="Transactions">
        <QueryState isLoading={txsQuery.isLoading} error={txsQuery.error}>
          {txsQuery.data?.length === 0 && (
            <p className="text-sm text-slate-500">No transactions yet.</p>
          )}
          <ul className="flex flex-col gap-1 text-sm">
            {txsQuery.data?.map((tx) => (
              <li key={tx.tx_hash} className="flex items-center gap-2">
                <HashLink kind="tx" id={tx.tx_hash} visible={12} />
                <span className="text-slate-500">
                  block {tx.block_height} ·{" "}
                  {new Date(tx.block_time * 1000).toLocaleString()}
                </span>
              </li>
            ))}
          </ul>
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
