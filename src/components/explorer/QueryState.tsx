import type { ReactNode } from "react";
import { BlockfrostError } from "../../lib/dingo/blockfrost";

export function QueryState({
  isLoading,
  error,
  notFoundLabel,
  hasData,
  children,
}: {
  isLoading: boolean;
  error: unknown;
  notFoundLabel?: string;
  hasData: boolean;
  children: ReactNode;
}) {
  const notFound = error instanceof BlockfrostError && error.status === 404;
  const stale = Boolean(error && hasData && !notFound);
  if (isLoading && !hasData) {
    return (
      <div role="status" aria-label="Loading data">
        <div className="skeleton" />
        <p className="mt-3 text-xs text-slate-400">Loading network data…</p>
      </div>
    );
  }
  if (error && !stale) {
    if (notFound) {
      return (
        <p className="text-sm text-slate-500">
          {notFoundLabel ?? "Not found."}
        </p>
      );
    }
    return (
      <p role="alert" className="text-sm text-red-400">
        {error instanceof Error ? error.message : "Something went wrong."}
      </p>
    );
  }
  return (
    <>
      {stale ? (
        <p role="status" className="mb-3 text-sm text-amber-300">
          Update unavailable. Showing previously loaded data.{" "}
          {error instanceof Error ? error.message : "Could not refresh."}
        </p>
      ) : null}
      {children}
    </>
  );
}
