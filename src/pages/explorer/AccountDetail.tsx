import { useParams } from "react-router";
import { useQuery } from "@tanstack/react-query";
import { blockfrostFetch } from "../../lib/dingo/blockfrost";
import { Panel, Field } from "../../components/explorer/Panel";
import { HashLink } from "../../components/explorer/HashLink";
import { QueryState } from "../../components/explorer/QueryState";
import { PaginatedList } from "../../components/explorer/PaginatedList";
import { YoursBadge } from "../../components/explorer/YoursBadge";
import { formatAda } from "../../lib/format";

interface AccountResponse {
  stake_address: string;
  active: boolean;
  active_epoch: number | null;
  controlled_amount: string;
  rewards_sum: string;
  withdrawals_sum: string;
  reserves_sum: string;
  treasury_sum: string;
  withdrawable_amount: string;
  pool_id: string | null;
  drep_id: string | null;
  registered: boolean;
}

interface DelegationHistoryRow {
  active_epoch: number;
  tx_hash: string;
  amount: string;
  pool_id: string;
}

interface RewardHistoryRow {
  epoch: number;
  amount: string;
  pool_id: string;
  type: string;
}

interface RegistrationHistoryRow {
  tx_hash: string;
  action: string;
  deposit: string;
  tx_slot: number;
  block_time: number;
}

interface AccountTransactionRow {
  tx_hash: string;
  block_height: number;
  block_time: number;
}

interface WithdrawalRow {
  tx_hash: string;
  amount: string;
  block_time: number;
}

interface AssociatedAddressRow {
  address: string;
}

interface AccountUtxoRow {
  address: string;
  tx_hash: string;
  output_index: number;
}

export default function AccountDetail() {
  const { stakeAddress } = useParams();

  const summaryQuery = useQuery({
    queryKey: ["dingo", "account", stakeAddress],
    queryFn: () =>
      blockfrostFetch<AccountResponse>(`/api/v0/accounts/${stakeAddress}`),
    enabled: Boolean(stakeAddress),
  });

  return (
    <div className="flex flex-col gap-4">
      <Panel
        title={
          <>
            Account <YoursBadge value={stakeAddress} />
          </>
        }
      >
        <QueryState
          isLoading={summaryQuery.isLoading}
          error={summaryQuery.error}
          notFoundLabel="Stake account not found."
        >
          {summaryQuery.data && (
            <div>
              <Field label="Stake address" value={summaryQuery.data.stake_address} />
              <Field
                label="Registered"
                value={summaryQuery.data.registered ? "Yes" : "No"}
              />
              <Field label="Active" value={summaryQuery.data.active ? "Yes" : "No"} />
              <Field
                label="Controlled amount"
                value={formatAda(BigInt(summaryQuery.data.controlled_amount))}
              />
              <Field
                label="Rewards sum"
                value={formatAda(BigInt(summaryQuery.data.rewards_sum))}
              />
              <Field
                label="Withdrawals sum"
                value={formatAda(BigInt(summaryQuery.data.withdrawals_sum))}
              />
              <Field
                label="Reserves"
                value={formatAda(BigInt(summaryQuery.data.reserves_sum))}
              />
              <Field
                label="Treasury"
                value={formatAda(BigInt(summaryQuery.data.treasury_sum))}
              />
              <Field
                label="Withdrawable"
                value={formatAda(BigInt(summaryQuery.data.withdrawable_amount))}
              />
              <Field
                label="Delegated pool"
                value={
                  summaryQuery.data.pool_id ? (
                    <HashLink kind="pool" id={summaryQuery.data.pool_id} visible={10} />
                  ) : (
                    "—"
                  )
                }
              />
              <Field
                label="DRep"
                value={
                  summaryQuery.data.drep_id ? (
                    <HashLink kind="drep" id={summaryQuery.data.drep_id} visible={10} />
                  ) : (
                    "—"
                  )
                }
              />
            </div>
          )}
        </QueryState>
      </Panel>

      <Panel title="Delegation history">
        <PaginatedList<DelegationHistoryRow>
          queryKey={["dingo", "account", stakeAddress, "delegations"]}
          buildUrl={(page, count) =>
            `/api/v0/accounts/${stakeAddress}/delegations?page=${page}&count=${count}&order=desc`
          }
          keyFor={(row) => row.tx_hash}
          emptyLabel="No delegation history."
          renderItem={(row) => (
            <span>
              Epoch {row.active_epoch} →{" "}
              <HashLink kind="pool" id={row.pool_id} visible={10} /> (
              <HashLink kind="tx" id={row.tx_hash} visible={8} />)
            </span>
          )}
        />
      </Panel>

      <Panel title="Reward history">
        <PaginatedList<RewardHistoryRow>
          queryKey={["dingo", "account", stakeAddress, "rewards"]}
          buildUrl={(page, count) =>
            `/api/v0/accounts/${stakeAddress}/rewards?page=${page}&count=${count}&order=desc`
          }
          keyFor={(row, index) => `${row.epoch}:${row.type}:${index}`}
          emptyLabel="No reward history."
          renderItem={(row) => (
            <span>
              Epoch {row.epoch} · {formatAda(BigInt(row.amount))} · {row.type}
              {row.pool_id && (
                <>
                  {" "}
                  from <HashLink kind="pool" id={row.pool_id} visible={10} />
                </>
              )}
            </span>
          )}
        />
      </Panel>

      <Panel title="Registration history">
        <PaginatedList<RegistrationHistoryRow>
          queryKey={["dingo", "account", stakeAddress, "registrations"]}
          buildUrl={(page, count) =>
            `/api/v0/accounts/${stakeAddress}/registrations?page=${page}&count=${count}&order=desc`
          }
          keyFor={(row, index) => `${row.tx_hash}:${index}`}
          emptyLabel="No registration history."
          renderItem={(row) => (
            <span>
              {row.action} · deposit {formatAda(BigInt(row.deposit))} ADA · slot {row.tx_slot} ·{" "}
              <HashLink kind="tx" id={row.tx_hash} visible={10} />
            </span>
          )}
        />
      </Panel>

      <Panel title="Withdrawals">
        <PaginatedList<WithdrawalRow>
          queryKey={["dingo", "account", stakeAddress, "withdrawals"]}
          buildUrl={(page, count) =>
            `/api/v0/accounts/${stakeAddress}/withdrawals?page=${page}&count=${count}&order=desc`
          }
          keyFor={(row) => row.tx_hash}
          emptyLabel="No withdrawals."
          renderItem={(row) => (
            <span>
              {formatAda(BigInt(row.amount))} —{" "}
              <HashLink kind="tx" id={row.tx_hash} visible={12} /> ·{" "}
              {new Date(row.block_time * 1000).toLocaleString()}
            </span>
          )}
        />
      </Panel>

      <Panel title="UTxOs">
        <PaginatedList<AccountUtxoRow>
          queryKey={["dingo", "account", stakeAddress, "utxos"]}
          buildUrl={(page, count) =>
            `/api/v0/accounts/${stakeAddress}/utxos?page=${page}&count=${count}`
          }
          keyFor={(row) => `${row.tx_hash}:${row.output_index}`}
          emptyLabel="No UTxOs delegating to this account."
          renderItem={(row) => (
            <span>
              <HashLink kind="address" id={row.address} visible={10} /> ·{" "}
              <HashLink kind="tx" id={row.tx_hash} visible={8} />#{row.output_index}
            </span>
          )}
        />
      </Panel>

      <Panel title="Associated addresses">
        <PaginatedList<AssociatedAddressRow>
          queryKey={["dingo", "account", stakeAddress, "addresses"]}
          buildUrl={(page, count) =>
            `/api/v0/accounts/${stakeAddress}/addresses?page=${page}&count=${count}`
          }
          keyFor={(row) => row.address}
          emptyLabel="No associated addresses."
          renderItem={(row) => (
            <HashLink kind="address" id={row.address} visible={12} />
          )}
        />
      </Panel>

      <Panel title="Transactions">
        <PaginatedList<AccountTransactionRow>
          queryKey={["dingo", "account", stakeAddress, "transactions"]}
          buildUrl={(page, count) =>
            `/api/v0/accounts/${stakeAddress}/transactions?page=${page}&count=${count}&order=desc`
          }
          keyFor={(row) => row.tx_hash}
          emptyLabel="No transactions for this stake account."
          renderItem={(row) => (
            <span>
              <HashLink kind="tx" id={row.tx_hash} visible={12} /> · block {row.block_height} ·{" "}
              {new Date(row.block_time * 1000).toLocaleString()}
            </span>
          )}
        />
      </Panel>
    </div>
  );
}
