import { Link } from "react-router";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { blockfrostFetch } from "../../lib/dingo/blockfrost";
import { useWalletDRep } from "../../lib/dingo/useWalletDRep";
import type { Cip30WalletApi } from "../../lib/dingo/cip30";
import { Panel } from "./Panel";
import { HashLink } from "./HashLink";
import { QueryState } from "./QueryState";

interface OwnerRecord {
  pool_id: string;
  owners: string[];
}

export function WalletRoles({
  stakeAddress,
  delegatedPool,
  walletApi,
}: {
  stakeAddress: string | null;
  delegatedPool?: string | null;
  walletApi: Cip30WalletApi | null;
}) {
  const [poolInput, setPoolInput] = useState("");
  const [requestedPool, setRequestedPool] = useState<string | null>(null);
  const poolId = requestedPool ?? delegatedPool;
  const ownership = useQuery({
    queryKey: ["dingo", "pool", poolId],
    queryFn: ({ signal }) =>
      blockfrostFetch<OwnerRecord>(`/api/v0/pools/${poolId}`, { signal }),
    enabled: Boolean(stakeAddress && poolId),
    staleTime: 300_000,
    retry: false,
  });
  const isOwner = ownership.data?.owners.includes(stakeAddress!);
  const selfDrep = useWalletDRep();
  return (
    <Panel title="Your roles on chain">
      <div className="wallet-role-grid">
        <section className="wallet-role-card">
          <span className="wallet-role-icon" aria-hidden="true">
            ⬡
          </span>
          <h3>Pool ownership</h3>
          {!stakeAddress ? (
            <p>No wallet stake credential available to check.</p>
          ) : (
            <>
              {poolId ? (
                <>
                  <HashLink kind="pool" id={poolId} />
                  <QueryState
                    isLoading={ownership.isLoading}
                    error={ownership.error}
                  >
                    {ownership.isSuccess && (
                      <p>
                        {isOwner
                          ? "Your stake credential is a registered owner of this pool."
                          : "Your stake credential is not listed as an owner of this pool."}
                      </p>
                    )}
                  </QueryState>
                </>
              ) : (
                <p>Select a pool to check its owner record.</p>
              )}
              <p className="mt-2 text-xs text-slate-500">
                Only this pool is checked. Other pools have not been searched.
              </p>
              <form
                className="mt-3 flex flex-col gap-2"
                onSubmit={(event) => {
                  event.preventDefault();
                  setRequestedPool(poolInput.trim());
                }}
              >
                <label className="text-xs text-slate-400">
                  Check another pool ID
                  <input
                    aria-label="Pool ID to check ownership"
                    className="mt-1 w-full rounded border border-slate-700 p-2"
                    value={poolInput}
                    onChange={(event) => setPoolInput(event.target.value)}
                    placeholder="pool1…"
                  />
                </label>
                <button
                  type="submit"
                  disabled={
                    !/^pool1[02-9ac-hj-np-z]{51}$/.test(poolInput.trim())
                  }
                  className="self-start rounded border border-slate-700 px-3 py-2 text-xs disabled:opacity-40"
                >
                  Check ownership
                </button>
                {requestedPool && delegatedPool && (
                  <button
                    type="button"
                    onClick={() => setRequestedPool(null)}
                    className="self-start text-xs text-teal-300"
                  >
                    Check delegated pool
                  </button>
                )}
              </form>
            </>
          )}
        </section>
        <section className="wallet-role-card">
          <span className="wallet-role-icon" aria-hidden="true">
            ◈
          </span>
          <h3>DRep registration</h3>
          {!walletApi?.cip95 ? (
            <p>The connected wallet does not expose its DRep credential.</p>
          ) : (
            <QueryState isLoading={selfDrep.isLoading} error={selfDrep.error}>
              {selfDrep.data ? (
                <>
                  <span className="status-badge">
                    {selfDrep.data.retired
                      ? "Retired DRep"
                      : selfDrep.data.expired
                        ? "Expired DRep"
                        : selfDrep.data.active
                          ? "Active DRep"
                          : "Registered DRep"}
                  </span>
                  <HashLink kind="drep" id={selfDrep.data.drep_id} />
                  {!selfDrep.data.retired && (
                    <Link
                      to="/explorer/governance"
                      className="text-sm text-teal-300"
                    >
                      Vote on governance actions →
                    </Link>
                  )}
                </>
              ) : (
                selfDrep.isSuccess && (
                  <p>
                    This wallet’s DRep credential is not registered on this
                    network.
                  </p>
                )
              )}
            </QueryState>
          )}
        </section>
      </div>
    </Panel>
  );
}
