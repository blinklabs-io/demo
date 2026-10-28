import { CopyButton } from "./CopyButton";
import { PoolIdentity } from "./PoolIdentity";
import { Link } from "react-router";
import { shortenHash } from "../../lib/format";

type Kind = "tx" | "block" | "address" | "account" | "pool" | "drep" | "asset";

const ROUTE: Record<Kind, (id: string) => string> = {
  tx: (id) => `/explorer/tx/${id}`,
  block: (id) => `/explorer/block/${id}`,
  address: (id) => `/explorer/address/${id}`,
  account: (id) => `/explorer/account/${id}`,
  pool: (id) => `/explorer/pool/${id}`,
  drep: (id) => `/explorer/drep/${id}`,
  asset: (id) => `/explorer/asset/${id}`,
};

export function HashLink({
  kind,
  id,
  visible = 8,
  full = false,
}: {
  kind: Kind;
  id: string;
  visible?: number;
  full?: boolean;
}) {
  if (kind === "pool") return <PoolIdentity poolId={id} compact />;
  if (kind === "address" || kind === "account")
    return (
      <span
        className={`address-identifier${full ? " address-identifier-full" : ""}`}
      >
        <Link
          to={ROUTE[kind](id)}
          title={id}
          className="font-mono text-sky-400 hover:text-sky-300 hover:underline"
        >
          {id}
        </Link>
        <CopyButton value={id} />
      </span>
    );
  return (
    <Link
      to={ROUTE[kind](id)}
      title={id}
      className="font-mono text-sky-400 hover:text-sky-300 hover:underline"
    >
      {kind === "drep" && id === "drep_always_abstain"
        ? "Always abstain"
        : kind === "drep" && id === "drep_always_no_confidence"
          ? "Always no confidence"
          : full
            ? id
            : shortenHash(id, visible)}
    </Link>
  );
}
