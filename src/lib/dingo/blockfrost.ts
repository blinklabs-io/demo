import { DINGO_CONFIG } from "./config";

export class BlockfrostError extends Error {
  status: number;
  path: string;
  body?: unknown;

  constructor(message: string, status: number, path: string, body?: unknown) {
    super(message);
    this.name = "BlockfrostError";
    this.status = status;
    this.path = path;
    this.body = body;
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
  const url = `${DINGO_CONFIG.blockfrostUrl}${path}`;
  let response: Response;
  try {
    response = await fetch(url, init);
  } catch (cause) {
    throw new BlockfrostError(
      `Could not reach Dingo at ${DINGO_CONFIG.blockfrostUrl}. Is it running, and is CORS enabled for this origin?`,
      0,
      path,
      cause,
    );
  }

  if (!response.ok) {
    let body: unknown;
    try {
      body = await response.json();
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

  return (await response.json()) as T;
}
