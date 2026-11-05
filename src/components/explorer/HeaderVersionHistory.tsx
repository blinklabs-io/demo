import { useEffect, useState } from "react";
import {
  loadHeaderHistory,
  type HeaderHistoryProgress,
} from "../../lib/explorer/headerHistory";
import { HeaderVersionChart } from "./HeaderVersionChart";
import { RecentHeaderVersions } from "./RecentHeaderVersions";
import "./header-history.css";

type RecentBlock = { hash: string; slot: number; height: number; time: number };
type Job = {
  id: number;
  data: HeaderHistoryProgress | null;
  settled: boolean;
  error: string;
};
export function HeaderVersionHistory({ recent }: { recent: RecentBlock[] }) {
  const [view, setView] = useState<"day" | "recent">("day");
  const [run, setRun] = useState(0);
  const [job, setJob] = useState<Job>({
    id: -1,
    data: null,
    settled: false,
    error: "",
  });
  const loading = view === "day" && (job.id !== run || !job.settled);
  useEffect(() => {
    if (view !== "day") return;
    let active = true;
    const controller = new AbortController();
    void loadHeaderHistory({
      signal: controller.signal,
      onProgress: (data) => {
        if (active) setJob({ id: run, data, settled: false, error: "" });
      },
    })
      .then((data) => {
        if (active) setJob({ id: run, data, settled: true, error: "" });
      })
      .catch((error) => {
        if (active)
          setJob((previous) => ({
            id: run,
            data: previous.data,
            settled: true,
            error:
              error instanceof Error
                ? error.message
                : "Unable to load header history.",
          }));
      });
    return () => {
      active = false;
      controller.abort();
    };
  }, [run, view]);
  useEffect(() => {
    if (
      view !== "day" ||
      job.id !== run ||
      !job.settled ||
      !job.data?.complete ||
      job.error
    )
      return;
    const timer = setTimeout(() => setRun((previous) => previous + 1), 60000);
    return () => clearTimeout(timer);
  }, [view, run, job.id, job.settled, job.data?.complete, job.error]);
  const data = job.data;
  const expected = data?.total ?? 0;
  const date = (seconds: number) => new Date(seconds * 1000).toLocaleString();
  return (
    <div className="header-history">
      <div className="header-history-toolbar">
        <div
          className="header-history-tabs"
          role="group"
          aria-label="Header comparison window"
        >
          <button
            type="button"
            aria-pressed={view === "day"}
            onClick={() => {
              if (view !== "day") {
                setRun((previous) => previous + 1);
                setView("day");
              }
            }}
          >
            24 hours · exact
          </button>
          <button
            type="button"
            aria-pressed={view === "recent"}
            onClick={() => setView("recent")}
          >
            Latest {recent.length} blocks
          </button>
        </div>
        {view === "day" && (
          <button
            type="button"
            className="header-history-refresh"
            disabled={loading}
            onClick={() => setRun((previous) => previous + 1)}
          >
            {loading
              ? "Reading history…"
              : job.error
                ? "Retry 24-hour history"
                : "Refresh ↻"}
          </button>
        )}
      </div>
      {view === "recent" ? (
        <RecentHeaderVersions blocks={recent} />
      ) : (
        <>
          <div
            className="header-history-progress"
            role="status"
            aria-live="polite"
          >
            <div>
              <strong>
                {data?.complete
                  ? `${data.rows.length.toLocaleString()} blocks · complete 24 hours`
                  : data?.rows.length
                    ? `${data.rows.length.toLocaleString()}${expected ? ` / ${expected.toLocaleString()}` : ""} headers verified`
                    : "Locating the 24-hour window…"}
              </strong>
              <span>
                {loading
                  ? "Loading in batches · no sampling"
                  : data?.complete
                    ? "Every block verified"
                    : job.error
                      ? "History load interrupted"
                      : ""}
              </span>
            </div>
            <progress
              aria-label="24-hour header history progress"
              max={expected || 1}
              value={expected ? data?.rows.length : undefined}
            />
            {data && (
              <p className="header-history-range">
                {date(data.cutoff)} → {date(data.snapshot.time)}
                {!data.complete && data.rows.length > 0
                  ? ` · verified through ${date(data.rows.at(-1)!.time)}`
                  : ""}
                {data.cached ? " · includes locally cached headers" : ""}
              </p>
            )}
            {!data?.complete && (
              <p>
                Counts cover the contiguous blocks verified so far. The full-day
                comparison becomes complete only after reaching and checking the
                snapshot block.
              </p>
            )}
          </div>
          {job.id === run && job.error && (
            <p className="header-history-error" role="alert">
              {job.error}
            </p>
          )}
          {data && (
            <HeaderVersionChart
              records={data.rows}
              startTime={data.cutoff}
              endTime={data.snapshot.time}
              complete={data.complete}
            />
          )}
        </>
      )}
    </div>
  );
}
