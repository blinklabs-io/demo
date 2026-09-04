import type { ReactNode } from "react";
import { BlockfrostError } from "../../lib/dingo/blockfrost";

export function QueryState({
  isLoading,
  error,
  notFoundLabel,
  children,
}: {
  isLoading: boolean;
  error: unknown;
  notFoundLabel?: string;
  children: ReactNode;
}) {
  if (isLoading) {
    return <p className="text-sm text-slate-500">Loading…</p>;
  }
  if (error) {
    if (error instanceof BlockfrostError && error.status === 404) {
      return (
        <p className="text-sm text-slate-500">
          {notFoundLabel ?? "Not found."}
        </p>
      );
    }
    return (
      <p className="text-sm text-red-400">
        {error instanceof Error ? error.message : "Something went wrong."}
      </p>
    );
  }
  return <>{children}</>;
}
