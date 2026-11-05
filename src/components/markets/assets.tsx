import { ChainMark } from "../explorer/ChainMark";
import { marketAssetName } from "./amounts";

export function MarketAsset({ unit }: { unit: string }) {
  return (
    <span className="market-asset">
      <span className="market-coin">
        {unit === "lovelace" || !unit ? "₳" : <ChainMark value={unit} />}
      </span>
      <span>{marketAssetName(unit)}</span>
    </span>
  );
}
export function MarketLoading({
  error,
  retry,
}: {
  error?: Error | null;
  retry: () => void;
}) {
  return (
    <div className="market-loading">
      {error ? (
        <>
          <div role="alert">
            <h2>Market data unavailable</h2>
            <p>{error.message}</p>
          </div>
          <button onClick={retry}>Retry Dingo query</button>
        </>
      ) : (
        <div role="status">
          <div className="market-skeleton" />
          <h2>Reading the market from Dingo…</h2>
          <p>Verifying contracts and loading a bounded page of live outputs.</p>
        </div>
      )}
    </div>
  );
}
