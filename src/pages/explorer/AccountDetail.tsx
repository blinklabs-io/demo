import { StakeJourney } from "../../components/chain/StakeJourney";
import { PageIntro } from "../../components/explorer/Visuals";
import { compactAda } from "../../lib/visualFormat";
import { Distribution } from "../../components/explorer/Visuals";
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

interface AccountTransactionRow {
  tx_hash: string;
  block_height: number;
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
    <div className="flex flex-col gap-4 detail-showcase">
      <PageIntro
        eyebrow="Stake. Delegate. Earn."
        title="Stake account"
        symbol="◎"
      />
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
              <Distribution
                title="Rewards"
                unit={compactAda(
                  BigInt(summaryQuery.data.withdrawable_amount) +
                    BigInt(summaryQuery.data.withdrawals_sum),
                )}
                items={[
                  {
                    label: "Available rewards",
                    value: BigInt(summaryQuery.data.withdrawable_amount),
                    display: compactAda(summaryQuery.data.withdrawable_amount),
                  },
                  {
                    label: "Withdrawn rewards",
                    value: BigInt(summaryQuery.data.withdrawals_sum),
                    display: compactAda(summaryQuery.data.withdrawals_sum),
                  },
                ]}
              />
              <div className="account-delegation">
                <div>
                  <span className="eyebrow">Controlled stake</span>
                  <strong>
                    {compactAda(summaryQuery.data.controlled_amount)}
                  </strong>
                </div>
                <div>
                  <span className="eyebrow">Delegated to</span>
                  {summaryQuery.data.pool_id ? (
                    <HashLink kind="pool" id={summaryQuery.data.pool_id} />
                  ) : (
                    <span>Not delegated</span>
                  )}
                </div>
              </div>
              <details className="technical-details">
                <summary>Account record & monetary values</summary>
                <div className="record-grid">
                  {" "}
                  <Field
                    label="Stake address"
                    value={summaryQuery.data.stake_address}
                  />
                  <Field
                    label="Registered"
                    value={summaryQuery.data.registered ? "Yes" : "No"}
                  />
                  <Field
                    label="Active"
                    value={summaryQuery.data.active ? "Yes" : "No"}
                  />
                  <Field
                    label="Controlled amount"
                    value={formatAda(
                      BigInt(summaryQuery.data.controlled_amount),
                    )}
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
                    value={formatAda(
                      BigInt(summaryQuery.data.withdrawable_amount),
                    )}
                  />
                  <Field
                    label="Delegated pool"
                    value={
                      summaryQuery.data.pool_id ? (
                        <HashLink
                          kind="pool"
                          id={summaryQuery.data.pool_id}
                          visible={10}
                        />
                      ) : (
                        "—"
                      )
                    }
                  />
                  <Field
                    label="DRep"
                    value={
                      summaryQuery.data.drep_id ? (
                        <HashLink
                          kind="drep"
                          id={summaryQuery.data.drep_id}
                          visible={10}
                        />
                      ) : (
                        "—"
                      )
                    }
                  />
                </div>
              </details>
            </div>
          )}
        </QueryState>
      </Panel>

      {summaryQuery.data && <StakeJourney stakeAddress={stakeAddress!} />}

      <details className="detail-disclosure">
        <summary>UTxOs</summary>
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
                <HashLink kind="tx" id={row.tx_hash} visible={8} />#
                {row.output_index}
              </span>
            )}
          />
        </Panel>
      </details>

      <details className="detail-disclosure">
        <summary>Associated addresses</summary>
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
      </details>

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
              <HashLink kind="tx" id={row.tx_hash} visible={12} /> · block{" "}
              {row.block_height} ·{" "}
              {new Date(row.block_time * 1000).toLocaleString()}
            </span>
          )}
        />
      </Panel>
    </div>
  );
}
