import { DINGO_CONFIG } from "./config";

export class BlockfrostError extends Error {
  status: number;
  path: string;
  body?: unknown;
  cause?: unknown;

  constructor(
    message: string,
    status: number,
    path: string,
    body?: unknown,
    cause?: unknown,
  ) {
    super(message);
    this.name = "BlockfrostError";
    this.status = status;
    this.path = path;
    this.body = body;
    this.cause = cause;
  }
}

// blockfrostFetch is a thin typed wrapper around Dingo's Blockfrost-compatible
// REST API. It is hand-written rather than generated: the surface is small,
// fixed, and documented directly by Dingo's own handler comments, so codegen
// from an external spec would add a dependency without buying accuracy.
export async function blockfrostFetch<T>(
  path: string,
  init?: RequestInit,
): Promise<T> {
  const response = await blockfrostFetchResponse(path, init);

  try {
    return (await response.json()) as T;
  } catch (cause) {
    init?.signal?.throwIfAborted();
    throw new BlockfrostError(
      "Dingo returned invalid JSON.",
      response.status,
      path,
      undefined,
      cause,
    );
  }
}

// Use this when a caller needs response metadata or a non-JSON body, such as
// the API console. The regular blockfrostFetch helper remains the preferred
// choice for typed API calls.
export async function blockfrostFetchResponse(
  path: string,
  init?: RequestInit,
): Promise<Response> {
  const release = await acquireReadSlot(path, init);
  const controller = new AbortController();
  const abort = () => controller.abort(init?.signal?.reason);
  init?.signal?.addEventListener("abort", abort, { once: true });
  if (init?.signal?.aborted) abort();
  const timeout = setTimeout(
    () =>
      controller.abort(
        new DOMException("Dingo request timed out.", "TimeoutError"),
      ),
    60000,
  );
  try {
    const response = await request(path, {
      ...init,
      signal: controller.signal,
    });
    // Dingo holds admission until the response body has been written.
    const bytes = await response.arrayBuffer();
    return new Response(
      response.status === 204 || response.status === 205 ? null : bytes,
      {
        status: response.status,
        statusText: response.statusText,
        headers: response.headers,
      },
    );
  } catch (cause) {
    init?.signal?.throwIfAborted();
    if (cause instanceof BlockfrostError) throw cause;
    throw new BlockfrostError(
      controller.signal.aborted
        ? "Dingo request timed out."
        : "Could not read Dingo's response body.",
      0,
      path,
      undefined,
      cause,
    );
  } finally {
    clearTimeout(timeout);
    init?.signal?.removeEventListener("abort", abort);
    release();
  }
}

const lanes = new Map<string, { active: number; waiting: Array<() => void> }>();
function readLane(path: string): [string, number] {
  const route = path.split("?")[0];
  if (/^\/api\/v0\/epochs\/[^/]+(\/(next|previous))?$/.test(route))
    return ["epoch-summary", 1];
  if (route === "/api/v0/network") return ["chain", 2];
  if (/^\/api\/v0\/assets\/[^/]+$/.test(route)) return ["assets", 2];
  if (/^\/api\/v0\/governance\/dreps\/[^/]+$/.test(route)) return ["dreps", 1];
  if (
    /^\/api\/v0\/(addresses\/[^/]+(\/(transactions|txs|extended|total))?|accounts\/[^/]+(\/addresses(\/(assets|total))?)?)$/.test(
      route,
    )
  )
    return ["history", 2];
  if (/^\/api\/v0\/pools\/([^/]+|extended)$/.test(route)) return ["pools", 2];
  if (/^\/api\/v0\/mempool\/addresses\//.test(route)) return ["mempool", 1];
  return ["reads", 6];
}
async function acquireReadSlot(path: string, init?: RequestInit) {
  if (init?.method && init.method.toUpperCase() !== "GET") return () => {};
  const [name, limit] = readLane(path);
  let lane = lanes.get(name);
  if (!lane) {
    lane = { active: 0, waiting: [] };
    lanes.set(name, lane);
  }
  const state = lane;
  const signal = init?.signal;
  signal?.throwIfAborted();
  await new Promise<void>((resolve, reject) => {
    const start = () => {
      signal?.removeEventListener("abort", abort);
      state.active++;
      resolve();
    };
    const abort = () => {
      state.waiting = state.waiting.filter((item) => item !== start);
      reject(signal?.reason);
    };
    if (state.active < limit) start();
    else {
      state.waiting.push(start);
      signal?.addEventListener("abort", abort, { once: true });
    }
  });
  return () => {
    state.active--;
    state.waiting.shift()?.();
  };
}
async function pause(ms: number, signal?: AbortSignal | null) {
  signal?.throwIfAborted();
  await new Promise<void>((resolve, reject) => {
    const abort = () => {
      clearTimeout(timer);
      reject(signal?.reason);
    };
    const timer = setTimeout(() => {
      signal?.removeEventListener("abort", abort);
      resolve();
    }, ms);
    signal?.addEventListener("abort", abort, { once: true });
  });
}
async function request(path: string, init?: RequestInit): Promise<Response> {
  const url = `${DINGO_CONFIG.blockfrostUrl}${path}`;
  let response: Response;
  try {
    for (let attempt = 0; ; attempt++) {
      response = await fetch(url, init);
      if (
        response.status !== 429 ||
        attempt >= 2 ||
        (init?.method && init.method.toUpperCase() !== "GET")
      )
        break;
      const retry = response.headers.get("Retry-After");
      const seconds =
        retry && /^\d+$/.test(retry)
          ? Number(retry)
          : retry
            ? (Date.parse(retry) - Date.now()) / 1000
            : NaN;
      if (!Number.isFinite(seconds) || seconds < 0 || seconds > 30) break;
      await response.body?.cancel();
      await pause(seconds * 1000, init?.signal);
    }
  } catch (cause) {
    init?.signal?.throwIfAborted();
    throw new BlockfrostError(
      `Could not reach Dingo at ${DINGO_CONFIG.blockfrostUrl}. Is it running, and is CORS enabled for this origin?`,
      0,
      path,
      undefined,
      cause,
    );
  }

  if (!response.ok) {
    let body: unknown;
    try {
      const text = await response.text();
      if (text) {
        try {
          body = JSON.parse(text);
        } catch {
          body = text;
        }
      }
    } catch {
      body = undefined;
    }
    init?.signal?.throwIfAborted();
    const message =
      body &&
      typeof body === "object" &&
      "message" in body &&
      typeof body.message === "string"
        ? body.message.slice(0, 512)
        : `Dingo returned ${response.status} for ${path}`;
    throw new BlockfrostError(message, response.status, path, body);
  }

  return response;
}
