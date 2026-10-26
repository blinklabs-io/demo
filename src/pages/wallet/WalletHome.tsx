import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router";
import { useInfiniteQuery, useQuery } from "@tanstack/react-query";
import { useWalletStore } from "../../stores/walletStore";
import { PageIntro, Metric, BarChart } from "../../components/explorer/Visuals";
import { WalletWelcome } from "../../components/explorer/WalletWelcome";
import { WalletActivity } from "../../components/explorer/WalletActivity";
import { WalletRoles } from "../../components/explorer/WalletRoles";
import { Panel } from "../../components/explorer/Panel";
import { HashLink } from "../../components/explorer/HashLink";
import { QueryState } from "../../components/explorer/QueryState";
import { Pagination } from "../../components/explorer/Pagination";
import { AdaAmount } from "../../components/explorer/AdaAmount";
import { blockfrostFetch } from "../../lib/dingo/blockfrost";
import {
  groupWalletUtxos,
  stakeAddressFor,
  walletStakeAccount,
  type WalletUtxo,
} from "../../lib/dingo/wallet";
import { formatAda, shortenHash } from "../../lib/format";
import { compactAda } from "../../lib/visualFormat";

export default function WalletHome() {
  const status = useWalletStore((state) => state.status);
  const changeAddress = useWalletStore((state) => state.changeAddress);
  if (status !== "connected" || !changeAddress)
    return <WalletWelcome purpose="explore your portfolio" />;
  return <ConnectedWallet key={changeAddress} changeAddress={changeAddress} />;
}

function ConnectedWallet({ changeAddress }: { changeAddress: string }) {
  const usedAddresses = useWalletStore((state) => state.usedAddresses);
  const rewardAddress = useWalletStore((state) => state.rewardAddress);
  const balance = useWalletStore((state) => state.balanceLovelace);
  const walletApi = useWalletStore((state) => state.walletApi);
  const connectionId = useWalletStore((state) => state.connectionId);
  const stakeAddress = rewardAddress ?? stakeAddressFor(changeAddress);
  const [utxoPage, setUtxoPage] = useState(1);
  const [addressPage, setAddressPage] = useState(1);
  const account = useQuery({
    queryKey: ["dingo", "wallet", "account", stakeAddress],
    queryFn: ({ signal }) => walletStakeAccount(stakeAddress!, signal),
    enabled: Boolean(stakeAddress),
    staleTime: 30_000,
  });
  const addresses = useInfiniteQuery({
    queryKey: ["dingo", "wallet", "associated-addresses", stakeAddress],
    initialPageParam: 1,
    enabled: Boolean(stakeAddress),
    queryFn: async ({ pageParam, signal }) => {
      const rows = await blockfrostFetch<{ address: string }[]>(
        `/api/v0/accounts/${stakeAddress}/addresses?page=${pageParam}&count=100`,
        { signal },
      );
      for (const row of rows)
        if (stakeAddressFor(row.address) !== stakeAddress)
          throw new Error(
            "Dingo returned an address with a different stake credential.",
          );
      return rows;
    },
    getNextPageParam: (last, _pages, page) =>
      last.length === 100 ? page + 1 : undefined,
    staleTime: 30_000,
  });
  const utxos = useInfiniteQuery({
    queryKey: ["dingo", "wallet", "stake-utxos", stakeAddress ?? changeAddress],
    initialPageParam: 1,
    queryFn: async ({ pageParam, signal }) => {
      const path = stakeAddress
        ? `/api/v0/accounts/${stakeAddress}/utxos`
        : `/api/v0/addresses/${changeAddress}/utxos`;
      const rows = await blockfrostFetch<WalletUtxo[]>(
        `${path}?page=${pageParam}&count=100`,
        { signal },
      );
      if (stakeAddress)
        for (const row of rows)
          if (!row.address || stakeAddressFor(row.address) !== stakeAddress)
            throw new Error(
              "Dingo returned a UTxO with a different stake credential.",
            );
      return rows;
    },
    getNextPageParam: (last, _pages, page) =>
      last.length === 100 ? page + 1 : undefined,
    staleTime: 30_000,
  });
  const {
    hasNextPage: moreAddresses,
    isFetchingNextPage: fetchingAddresses,
    fetchNextPage: fetchAddresses,
    isError: addressError,
  } = addresses;
  const {
    hasNextPage: moreUtxos,
    isFetchingNextPage: fetchingUtxos,
    fetchNextPage: fetchUtxos,
    isError: utxoError,
  } = utxos;
  useEffect(() => {
    if (stakeAddress && moreAddresses && !fetchingAddresses && !addressError)
      void fetchAddresses();
  }, [
    stakeAddress,
    moreAddresses,
    fetchingAddresses,
    fetchAddresses,
    addressError,
  ]);
  useEffect(() => {
    if (moreUtxos && !fetchingUtxos && !utxoError) void fetchUtxos();
  }, [moreUtxos, fetchingUtxos, fetchUtxos, utxoError]);
  const outputs = useMemo(
    () => [
      ...new Map(
        (utxos.data?.pages.flat() ?? []).map((row) => [
          `${row.tx_hash}#${row.output_index}`,
          row,
        ]),
      ).values(),
    ],
    [utxos.data],
  );
  const groups = useMemo(
    () => groupWalletUtxos(outputs, changeAddress),
    [outputs, changeAddress],
  );
  const walletAddresses = useMemo(
    () =>
      [
        ...new Set([
          changeAddress,
          ...usedAddresses,
          ...(addresses.data?.pages.flat().map((row) => row.address) ?? []),
          ...groups.map((group) => group.address),
        ]),
      ].filter(
        (address) => !stakeAddress || stakeAddressFor(address) === stakeAddress,
      ),
    [changeAddress, usedAddresses, addresses.data, groups, stakeAddress],
  );
  const total = groups.reduce((sum, group) => sum + group.lovelace, 0n);
  const loadingUtxos =
    !utxoError && (utxos.isPending || moreUtxos || fetchingUtxos);
  const visibleOutputs = outputs.slice((utxoPage - 1) * 12, utxoPage * 12);
  const visibleAddresses = walletAddresses.slice(
    (addressPage - 1) * 12,
    addressPage * 12,
  );
  return (
    <div className="flex flex-col gap-4 wallet-portfolio">
      <PageIntro
        eyebrow="Connected through Dingo"
        title="Your corner of the chain."
        symbol="▣"
      />
      <section className="wallet-balance-hero">
        <div>
          <span className="eyebrow">Connected wallet balance</span>
          <strong>{balance === null ? "—" : formatAda(balance)}</strong>
          <p>Reported by your wallet</p>
        </div>
        <div className="wallet-stake-identity">
          <span className="eyebrow">Stake account</span>
          {stakeAddress ? (
            <HashLink kind="account" id={stakeAddress} visible={12} />
          ) : (
            <span>No stake credential on this address</span>
          )}
          <Link to="/wallet/send">Send →</Link>
        </div>
      </section>
      <div className="metric-grid">
        <Metric
          label={
            loadingUtxos || utxos.isError
              ? "Stake-linked ADA loaded"
              : stakeAddress
                ? "Stake-linked ADA"
                : "Address ADA"
          }
          value={utxos.data ? compactAda(total) : "—"}
          detail={
            utxos.error
              ? "Discovery incomplete"
              : loadingUtxos
                ? "Discovering outputs across the stake account"
                : `${outputs.length.toLocaleString()} UTxOs`
          }
        />
        <Metric
          label="Related addresses found"
          value={walletAddresses.length}
          detail={
            addressError
              ? "Address discovery incomplete"
              : moreAddresses
                ? "Discovering associated addresses"
                : "Wallet and Dingo address records"
          }
        />
        <Metric
          label="Available rewards"
          value={
            account.data
              ? compactAda(account.data.withdrawable_amount)
              : account.isSuccess
                ? "Not registered"
                : "—"
          }
        />
      </div>
      {stakeAddress && (
        <Panel title="Your delegation">
          <QueryState isLoading={account.isLoading} error={account.error}>
            {account.isSuccess && (
              <div className="wallet-role-grid">
                <section className="wallet-role-card">
                  <span className="wallet-role-icon" aria-hidden="true">
                    ⬡
                  </span>
                  <h3>Stake pool</h3>
                  {account.data?.pool_id ? (
                    <HashLink kind="pool" id={account.data.pool_id} />
                  ) : (
                    <p>Not delegated to a stake pool.</p>
                  )}
                </section>
                <section className="wallet-role-card">
                  <span className="wallet-role-icon" aria-hidden="true">
                    ◈
                  </span>
                  <h3>Voting delegation</h3>
                  {account.data?.drep_id === "drep_always_abstain" ? (
                    <strong>Always abstain</strong>
                  ) : account.data?.drep_id === "drep_always_no_confidence" ? (
                    <strong>Always no confidence</strong>
                  ) : account.data?.drep_id ? (
                    <HashLink kind="drep" id={account.data.drep_id} />
                  ) : (
                    <p>No DRep delegation recorded.</p>
                  )}
                </section>
              </div>
            )}
          </QueryState>
        </Panel>
      )}
      <WalletActivity
        stakeAddress={account.data ? stakeAddress : undefined}
        poolId={account.data?.pool_id}
        addresses={walletAddresses}
        addressesComplete={
          !moreAddresses && !addresses.isFetching && !addresses.isError
        }
      />
      <WalletRoles
        stakeAddress={rewardAddress}
        delegatedPool={account.data?.pool_id}
        walletApi={walletApi}
        connectionId={connectionId}
      />
      <Panel
        title={
          stakeAddress
            ? "Addresses sharing your stake credential"
            : "Wallet addresses"
        }
      >
        {!addressError &&
          (addresses.isFetching || moreAddresses) &&
          stakeAddress && (
            <p className="directory-progress" role="status">
              Discovering stake-linked addresses…
            </p>
          )}
        {addresses.error && (
          <div role="alert" className="mb-4 text-sm text-red-400">
            <p>Address discovery incomplete: {addresses.error.message}</p>
            <button
              type="button"
              disabled={addresses.isFetching}
              className="mt-2 text-xs text-teal-300"
              onClick={() =>
                void (moreAddresses
                  ? addresses.fetchNextPage()
                  : addresses.refetch())
              }
            >
              Retry address discovery
            </button>
          </div>
        )}
        {groups.length > 1 && (
          <div className="mb-6">
            <BarChart
              title="ADA per funded address"
              items={groups.slice(0, 12).map((group) => ({
                label: shortenHash(group.address, 5),
                value: Number(group.lovelace) / 1_000_000,
                href: `/explorer/address/${group.address}`,
              }))}
            />
            <p className="mt-3 text-xs text-slate-500">
              Up to 12 funded addresses with the largest balances in the loaded
              UTxOs.
            </p>
          </div>
        )}
        <div className="wallet-address-grid">
          {visibleAddresses.map((address) => {
            const group = groups.find((group) => group.address === address);
            return (
              <div className="wallet-address-card" key={address}>
                <span className="eyebrow">
                  {address === changeAddress
                    ? "Change address"
                    : usedAddresses.includes(address)
                      ? "Wallet address"
                      : "Stake-linked address"}
                </span>
                <HashLink kind="address" id={address} visible={12} />
                <div>
                  <strong>
                    {group
                      ? formatAda(group.lovelace)
                      : loadingUtxos
                        ? "Checking…"
                        : utxos.isSuccess
                          ? formatAda(0n)
                          : "—"}
                  </strong>
                  <span>
                    {group
                      ? `${group.utxoCount} UTxOs · ${group.assets.size} native assets`
                      : utxos.isSuccess && !loadingUtxos
                        ? "No unspent outputs"
                        : ""}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
        <Pagination
          page={addressPage}
          onPageChange={setAddressPage}
          hasNextPage={addressPage * 12 < walletAddresses.length}
        />
      </Panel>
      <Panel
        title={
          stakeAddress ? "UTxOs across the stake account" : "Address UTxOs"
        }
        action={
          <span className="text-xs text-slate-400">
            {outputs.length.toLocaleString()} loaded
          </span>
        }
      >
        {loadingUtxos && (
          <p className="directory-progress" role="status">
            Discovering unspent outputs…
          </p>
        )}
        {utxos.error && (
          <div role="alert" className="mb-4 text-sm text-red-400">
            <p>UTxO discovery incomplete: {utxos.error.message}</p>
            <button
              type="button"
              disabled={utxos.isFetching}
              className="mt-2 text-xs text-teal-300"
              onClick={() =>
                void (moreUtxos ? utxos.fetchNextPage() : utxos.refetch())
              }
            >
              Retry UTxO discovery
            </button>
          </div>
        )}
        {utxos.isSuccess && !loadingUtxos && !outputs.length && (
          <div className="list-empty">
            <span aria-hidden="true">◇</span>
            <p>No unspent outputs.</p>
          </div>
        )}
        <div className="wallet-utxo-grid">
          {visibleOutputs.map((utxo) => (
            <article
              className="wallet-address-card"
              key={`${utxo.tx_hash}#${utxo.output_index}`}
            >
              <span className="eyebrow">Output #{utxo.output_index}</span>
              <HashLink kind="tx" id={utxo.tx_hash} visible={12} />
              <AdaAmount amount={utxo.amount} />
              <HashLink
                kind="address"
                id={utxo.address ?? changeAddress}
                visible={10}
              />
            </article>
          ))}
        </div>
        <Pagination
          page={utxoPage}
          onPageChange={setUtxoPage}
          hasNextPage={utxoPage * 12 < outputs.length}
        />
      </Panel>
      <details className="detail-disclosure">
        <summary>Connected wallet identity</summary>
        <div className="network-value-grid">
          <div className="data-field">
            <span className="field-label">Change address</span>
            <HashLink kind="address" id={changeAddress} full />
          </div>
          {rewardAddress && (
            <div className="data-field">
              <span className="field-label">Reward address</span>
              <HashLink kind="account" id={rewardAddress} full />
            </div>
          )}
        </div>
      </details>
    </div>
  );
}
