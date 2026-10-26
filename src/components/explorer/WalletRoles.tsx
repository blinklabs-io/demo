import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { blockfrostFetch, BlockfrostError } from "../../lib/dingo/blockfrost";
import { drepIdForPublicKey } from "../../lib/dingo/wallet";
import type { Cip30WalletApi } from "../../lib/dingo/cip30";
import { Panel } from "./Panel";
import { HashLink } from "./HashLink";
import { QueryState } from "./QueryState";

interface OwnerRecord {
  pool_id: string;
  owners: string[];
}
interface DRepRole {
  drep_id: string;
  active: boolean;
  retired: boolean;
  expired: boolean;
}

export function WalletRoles({
  stakeAddress,
  delegatedPool,
  walletApi,
  connectionId,
}: {
  stakeAddress: string | null;
  delegatedPool?: string | null;
  walletApi: Cip30WalletApi | null;
  connectionId: number;
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
  const selfDrep = useQuery({
    queryKey: ["dingo", "wallet", "drep-role", connectionId],
    enabled: Boolean(walletApi?.cip95),
    queryFn: async ({ signal }) => {
      const key = await walletApi!.cip95!.getPubDRepKey();
      const id = drepIdForPublicKey(key);
      try {
        return await blockfrostFetch<DRepRole>(
          `/api/v0/governance/dreps/${id}`,
          { signal },
        );
      } catch (error) {
        if (error instanceof BlockfrostError && error.status === 404)
          return null;
        throw error;
      }
    },
    staleTime: 60_000,
    retry: false,
  });
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
