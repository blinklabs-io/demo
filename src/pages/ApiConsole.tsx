import { useState } from "react";
import type { FormEvent } from "react";
import {
  blockfrostFetchResponse,
  BlockfrostError,
} from "../lib/dingo/blockfrost";
import { DINGO_CONFIG } from "../lib/dingo/config";
import { Panel } from "../components/explorer/Panel";

const ENDPOINT_PRESETS = [
  { label: "Health", path: "/health" },
  { label: "Latest block", path: "/api/v0/blocks/latest" },
  { label: "Network", path: "/api/v0/network" },
  { label: "Latest epoch", path: "/api/v0/epochs/latest" },
] as const;

type ConsoleResult = {
  status: number;
  duration: number;
  body: string;
  isJson: boolean;
};

function isSafePath(path: string): boolean {
  if (!path.startsWith("/") || path.startsWith("//") || path.includes("\\")) {
    return false;
  }

  try {
    const base = new URL(DINGO_CONFIG.blockfrostUrl);
    return new URL(path, base).origin === base.origin;
  } catch {
    return false;
  }
}

function formatErrorBody(body: unknown): string {
  if (body instanceof Error) return body.message;
  if (typeof body === "string") return body;
  try {
    return JSON.stringify(body, null, 2) ?? String(body);
  } catch {
    return String(body);
  }
}

async function readResponseBody(response: Response): Promise<{
  body: string;
  isJson: boolean;
}> {
  const text = await response.text();
  if (!text) return { body: "", isJson: false };

  try {
    return { body: JSON.stringify(JSON.parse(text), null, 2), isJson: true };
  } catch {
    return { body: text, isJson: false };
  }
}

export default function ApiConsole() {
  const [path, setPath] = useState<string>(ENDPOINT_PRESETS[0].path);
  const [result, setResult] = useState<ConsoleResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function execute(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const requestedPath = path.trim();
    if (!isSafePath(requestedPath)) {
      setResult(null);
      setError("Enter a relative API path beginning with /; absolute URLs are not allowed.");
      return;
    }

    setLoading(true);
    setError(null);
    setResult(null);
    const startedAt = performance.now();

    try {
      const response = await blockfrostFetchResponse(requestedPath, {
        method: "GET",
      });
      const responseBody = await readResponseBody(response);
      setResult({
        status: response.status,
        duration: Math.round(performance.now() - startedAt),
        ...responseBody,
      });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "The request failed.");
      const errorBody = cause instanceof BlockfrostError ? cause.body : undefined;
      setResult({
        status: cause && typeof cause === "object" && "status" in cause ? Number(cause.status) : 0,
        duration: Math.round(performance.now() - startedAt),
        body: errorBody === undefined ? "" : formatErrorBody(errorBody),
        isJson: errorBody !== undefined && typeof errorBody !== "string",
      });
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="text-xl font-semibold text-white">API Console</h1>
        <p className="mt-1 text-sm text-slate-400">
          Read-only GET requests against the Dingo-compatible Blockfrost API.
        </p>
      </div>

      <Panel title="Request">
        <form onSubmit={execute} className="flex flex-col gap-4">
          <div>
            <label htmlFor="api-endpoint" className="mb-1.5 block text-sm font-medium text-slate-300">
              Endpoint path
            </label>
            <div className="flex flex-col gap-2 sm:flex-row">
              <input
                id="api-endpoint"
                value={path}
                onChange={(event) => setPath(event.target.value)}
                className="min-w-0 flex-1 rounded-md border border-slate-700 bg-slate-950 px-3 py-2 font-mono text-sm text-slate-100 outline-none placeholder:text-slate-600 focus:border-sky-500"
                inputMode="url"
                spellCheck={false}
                aria-describedby="api-endpoint-help"
              />
              <button
                type="submit"
                disabled={loading}
                className="rounded-md bg-sky-600 px-4 py-2 text-sm font-semibold text-white hover:bg-sky-500 disabled:cursor-wait disabled:opacity-60"
              >
                {loading ? "Loading…" : "Execute GET"}
              </button>
            </div>
            <p id="api-endpoint-help" className="mt-1.5 text-xs text-slate-500">
              Requests are limited to {DINGO_CONFIG.blockfrostUrl}.
            </p>
          </div>

          <div>
            <span className="mb-1.5 block text-xs uppercase tracking-wide text-slate-500">Presets</span>
            <div className="flex flex-wrap gap-2" aria-label="Endpoint presets">
              {ENDPOINT_PRESETS.map((preset) => (
                <button
                  key={preset.path}
                  type="button"
                  onClick={() => setPath(preset.path)}
                  className="rounded-md border border-slate-700 px-2.5 py-1.5 text-xs text-slate-300 hover:border-slate-500 hover:text-white"
                >
                  {preset.label}
                </button>
              ))}
            </div>
          </div>
        </form>
      </Panel>

      <Panel title="Response">
        {loading && <p className="text-sm text-slate-400" role="status">Requesting {path.trim()}…</p>}
        {!loading && !result && !error && <p className="text-sm text-slate-500">Execute an endpoint to see its response.</p>}
        {(result || error) && (
          <>
            <div className="mb-3 flex flex-wrap gap-x-5 gap-y-1 text-xs text-slate-400" aria-live="polite">
              <span>Status: <strong className={result?.status && result.status < 400 ? "text-emerald-300" : "text-rose-300"}>{result?.status || "—"}</strong></span>
              <span>Duration: <strong className="text-slate-200">{result?.duration ?? "—"} ms</strong></span>
            </div>
            {error && <p className="mb-3 text-sm text-rose-300" role="alert">{error}</p>}
            {result?.body && (
              <pre className="max-h-[32rem] overflow-auto rounded-md border border-slate-800 bg-slate-950 p-3 text-xs leading-relaxed text-slate-300">
                <code>{result.body}</code>
              </pre>
            )}
          </>
        )}
      </Panel>
    </div>
  );
}
