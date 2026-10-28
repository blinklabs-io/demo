import { PageIntro } from "../components/explorer/Visuals";
import { useState } from "react";
import type { FormEvent } from "react";
import {
  blockfrostFetchResponse,
  BlockfrostError,
} from "../lib/dingo/blockfrost";
import { DINGO_CONFIG } from "../lib/dingo/config";
import { Panel } from "../components/explorer/Panel";

type ApiTarget = "blockfrost" | "mesh";

interface EndpointPreset {
  label: string;
  path: string;
  body?: string;
}

const BLOCKFROST_PRESETS: EndpointPreset[] = [
  { label: "Health", path: "/health" },
  { label: "Latest block", path: "/api/v0/blocks/latest" },
  { label: "Network supply and stake", path: "/api/v0/network" },
  { label: "Genesis", path: "/api/v0/genesis" },
  { label: "Current epoch", path: "/api/v0/epochs/latest" },
  { label: "Protocol parameters", path: "/api/v0/epochs/latest/parameters" },
  { label: "Network eras", path: "/api/v0/network/eras" },
  {
    label: "DReps",
    path: "/api/v0/governance/dreps?page=1&count=20&order_by=amount",
  },
  {
    label: "Governance proposals",
    path: "/api/v0/governance/proposals?page=1&count=20&order=desc",
  },
  { label: "Constitutional committee", path: "/api/v0/governance/committee" },
  {
    label: "Committee votes",
    path: "/api/v0/governance/committee/votes?page=1&count=20&order=desc",
  },
  { label: "Assets", path: "/api/v0/assets?page=1&count=20&order=desc" },
  { label: "Scripts", path: "/api/v0/scripts?page=1&count=20&order=desc" },
  {
    label: "Blockfrost mempool",
    path: "/api/v0/mempool?page=1&count=20&order=desc",
  },
  {
    label: "Latest block transaction CBOR",
    path: "/api/v0/blocks/latest/txs/cbor?page=1&count=20",
  },
  {
    label: "Retired pools",
    path: "/api/v0/pools/retired?page=1&count=20&order=desc",
  },
  {
    label: "Metadata label 674",
    path: "/api/v0/metadata/txs/labels/674?page=1&count=20",
  },
];

const PREVIEW_NETWORK = JSON.stringify(
  { network_identifier: { blockchain: "cardano", network: "preview" } },
  null,
  2,
);

const MESH_PRESETS: EndpointPreset[] = [
  { label: "Network list", path: "/network/list", body: "{}" },
  { label: "Network options", path: "/network/options", body: PREVIEW_NETWORK },
  { label: "Network status", path: "/network/status", body: PREVIEW_NETWORK },
  { label: "Mempool", path: "/mempool", body: PREVIEW_NETWORK },
];

const MESH_READ_PATHS = new Set([
  "/network/list",
  "/network/options",
  "/network/status",
  "/block",
  "/block/transaction",
  "/account/balance",
  "/account/coins",
  "/mempool",
  "/mempool/transaction",
]);

type ConsoleResult = {
  status: number;
  duration: number;
  body: string;
  isJson: boolean;
};

function isSafePath(path: string, target: ApiTarget): boolean {
  if (!path.startsWith("/") || path.startsWith("//") || path.includes("\\")) {
    return false;
  }
  if (target === "mesh" && !MESH_READ_PATHS.has(path)) return false;

  try {
    const base = new URL(
      target === "mesh" ? DINGO_CONFIG.meshUrl : DINGO_CONFIG.blockfrostUrl,
    );
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
  const [target, setTarget] = useState<ApiTarget>("blockfrost");
  const [path, setPath] = useState(BLOCKFROST_PRESETS[0].path);
  const [body, setBody] = useState("{}");
  const [result, setResult] = useState<ConsoleResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const presets = target === "mesh" ? MESH_PRESETS : BLOCKFROST_PRESETS;
  const baseUrl =
    target === "mesh" ? DINGO_CONFIG.meshUrl : DINGO_CONFIG.blockfrostUrl;

  function changeTarget(nextTarget: ApiTarget) {
    setTarget(nextTarget);
    const nextPresets =
      nextTarget === "mesh" ? MESH_PRESETS : BLOCKFROST_PRESETS;
    setPath(nextPresets[0].path);
    setBody(nextPresets[0].body ?? "{}");
    setResult(null);
    setError(null);
  }

  async function execute(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const requestedPath = path.trim();
    if (!isSafePath(requestedPath, target)) {
      setResult(null);
      setError(
        target === "mesh"
          ? "Choose one of the supported read-only Mesh endpoints."
          : "Enter a relative API path beginning with /; absolute URLs are not allowed.",
      );
      return;
    }

    let requestBody: string | undefined;
    if (target === "mesh") {
      try {
        const parsedBody: unknown = JSON.parse(body);
        if (
          parsedBody === null ||
          typeof parsedBody !== "object" ||
          Array.isArray(parsedBody)
        ) {
          throw new Error("Mesh requests must be JSON objects.");
        }
        requestBody = JSON.stringify(parsedBody);
      } catch {
        setResult(null);
        setError("Mesh requests need a valid JSON object.");
        return;
      }
    }

    setLoading(true);
    setError(null);
    setResult(null);
    const startedAt = performance.now();

    try {
      let response: Response;
      if (target === "blockfrost") {
        response = await blockfrostFetchResponse(requestedPath, {
          method: "GET",
        });
      } else {
        response = await fetch(`${DINGO_CONFIG.meshUrl}${requestedPath}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: requestBody,
        });
      }
      const responseBody = await readResponseBody(response);
      setResult({
        status: response.status,
        duration: Math.round(performance.now() - startedAt),
        ...responseBody,
      });
      if (!response.ok) {
        setError(
          `Dingo ${target === "mesh" ? "Mesh" : "Blockfrost-compatible"} API returned ${response.status}.`,
        );
      }
    } catch (cause) {
      const message =
        cause instanceof Error ? cause.message : "The request failed.";
      setError(message);
      const errorBody =
        cause instanceof BlockfrostError ? cause.body : undefined;
      const status =
        cause && typeof cause === "object" && "status" in cause
          ? Number(cause.status)
          : 0;
      setResult({
        status,
        duration: Math.round(performance.now() - startedAt),
        body: errorBody === undefined ? "" : formatErrorBody(errorBody),
        isJson: errorBody !== undefined && typeof errorBody !== "string",
      });
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="api-console-grid">
      <div className="api-console-heading">
        <PageIntro
          eyebrow="Talk directly to Dingo"
          title="Under the hood."
          detail="Explore the APIs powering every view in this demo."
          symbol="{ }"
        />
      </div>

      <Panel title="Request">
        <form onSubmit={execute} className="flex flex-col gap-4">
          <div>
            <label
              htmlFor="api-target"
              className="mb-1.5 block text-sm font-medium text-slate-300"
            >
              API
            </label>
            <select
              id="api-target"
              value={target}
              onChange={(event) =>
                changeTarget(event.target.value as ApiTarget)
              }
              className="rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100 outline-none focus:border-sky-500"
            >
              <option value="blockfrost">
                Blockfrost-compatible REST · GET
              </option>
              <option value="mesh">Mesh / Rosetta · read-only POST</option>
            </select>
          </div>

          <div>
            <label
              htmlFor="api-endpoint"
              className="mb-1.5 block text-sm font-medium text-slate-300"
            >
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
                {loading
                  ? "Loading…"
                  : target === "mesh"
                    ? "Execute POST"
                    : "Execute GET"}
              </button>
            </div>
            <p id="api-endpoint-help" className="mt-1.5 text-xs text-slate-500">
              Requests go to {baseUrl}.
            </p>
          </div>

          {target === "mesh" && (
            <div>
              <label
                htmlFor="mesh-request"
                className="mb-1.5 block text-sm font-medium text-slate-300"
              >
                JSON request
              </label>
              <textarea
                id="mesh-request"
                value={body}
                onChange={(event) => setBody(event.target.value)}
                rows={7}
                spellCheck={false}
                className="w-full rounded-md border border-slate-700 bg-slate-950 px-3 py-2 font-mono text-xs text-slate-100 outline-none focus:border-sky-500"
              />
            </div>
          )}

          <div>
            <span className="mb-1.5 block text-xs uppercase tracking-wide text-slate-500">
              Read-only presets
            </span>
            <select
              aria-label="Endpoint presets"
              value={presets.some((preset) => preset.path === path) ? path : ""}
              onChange={(event) => {
                const preset = presets.find(
                  (preset) => preset.path === event.target.value,
                );
                if (preset) {
                  setPath(preset.path);
                  setBody(preset.body ?? "{}");
                }
              }}
              className="w-full rounded-md border border-slate-700 bg-slate-950 px-3 py-3 text-sm text-slate-100"
            >
              <option value="" disabled>
                Custom endpoint
              </option>
              {presets.map((preset) => (
                <option key={preset.path} value={preset.path}>
                  {preset.label}
                </option>
              ))}
            </select>
          </div>
        </form>
      </Panel>

      <Panel title="Response">
        {loading && (
          <p className="text-sm text-slate-400" role="status">
            Requesting {path.trim()}…
          </p>
        )}
        {!loading && !result && !error && (
          <div className="terminal-ready">
            <span aria-hidden="true">{">_"}</span>
            <strong>Ready when you are.</strong>
            <p>Choose an endpoint and execute a request.</p>
          </div>
        )}
        {(result || error) && (
          <>
            <div
              className="mb-3 flex flex-wrap gap-x-5 gap-y-1 text-xs text-slate-400"
              aria-live="polite"
            >
              <span>
                Status:{" "}
                <strong
                  className={
                    result?.status && result.status < 400
                      ? "text-emerald-300"
                      : "text-rose-300"
                  }
                >
                  {result?.status || "—"}
                </strong>
              </span>
              <span>
                Duration:{" "}
                <strong className="text-slate-200">
                  {result?.duration ?? "—"} ms
                </strong>
              </span>
            </div>
            {error && (
              <p className="mb-3 text-sm text-rose-300" role="alert">
                {error}
              </p>
            )}
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
