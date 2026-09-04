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

  return (await response.json()) as T;
}

// Use this when a caller needs response metadata or a non-JSON body, such as
// the API console. The regular blockfrostFetch helper remains the preferred
// choice for typed API calls.
export async function blockfrostFetchResponse(
  path: string,
  init?: RequestInit,
): Promise<Response> {
  const url = `${DINGO_CONFIG.blockfrostUrl}${path}`;
  let response: Response;
  try {
    response = await fetch(url, init);
  } catch (cause) {
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
    throw new BlockfrostError(
      `Dingo returned ${response.status} for ${path}`,
      response.status,
      path,
      body,
    );
  }

  return response;
}
