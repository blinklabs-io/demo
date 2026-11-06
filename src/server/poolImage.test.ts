// @vitest-environment node
import { afterEach, expect, it, vi } from "vitest";
import { blake2bHex } from "blakejs";
import { poolImage } from "./poolImage";
import { onRequestGet } from "../../functions/pool-image";

const png = Uint8Array.from(
  Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aD1sAAAAASUVORK5CYII=",
    "base64",
  ),
);
const primary = JSON.stringify({
  name: "Pool",
  ticker: "POOL",
  extended: "./extended.json",
});
function request(doc = primary, url = "https://metadata.pool.org/pool.json") {
  return new Request(
    `https://demo.pages.dev/pool-image?${new URLSearchParams({ url, hash: blake2bHex(doc, undefined, 32) })}`,
  );
}
function upstream(doc = primary) {
  return vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
    const path = new URL(String(input)).pathname;
    if (path === "/pool.json") return new Response(doc);
    if (path === "/extended.json")
      return Response.json({ info: { url_png_icon_64x64: "./icon.png" } });
    return new Response(png, {
      headers: { "Content-Type": "text/html", "Set-Cookie": "owner=tracking" },
    });
  });
}
afterEach(() => vi.restoreAllMocks());

it("verifies the registered bytes, resolves relative extended logos and returns only image bytes", async () => {
  const fetch = upstream();
  const response = await poolImage(request());
  expect(response.status).toBe(200);
  expect(new Uint8Array(await response.arrayBuffer())).toEqual(png);
  expect(fetch.mock.calls.map(([url]) => String(url))).toEqual([
    "https://metadata.pool.org/pool.json",
    "https://metadata.pool.org/extended.json",
    "https://metadata.pool.org/icon.png",
  ]);
  expect(response.headers.get("content-type")).toBe("image/png");
  expect(response.headers.get("set-cookie")).toBeNull();
  expect(response.headers.get("x-content-type-options")).toBe("nosniff");
  expect(response.headers.get("cache-control")).toBe("public, max-age=3600");
  for (const [, init] of fetch.mock.calls) {
    expect(init?.redirect).toBe("manual");
    expect(init?.credentials).toBe("omit");
    expect(new Headers(init?.headers).has("cookie")).toBe(false);
  }
});

it("does not follow unverified metadata to extended documents or images", async () => {
  const fetch = upstream(primary + "\n");
  expect((await poolImage(request())).status).toBe(404);
  expect(fetch).toHaveBeenCalledTimes(1);
});

it.each([
  "http://127.0.0.1/x",
  "http://2130706433/x",
  "http://[::1]/x",
  "http://169.254.169.254/x",
  "https://localhost/x",
  "http://node.local/x",
  "https://user:password@pool.org/x",
  "https://pool.org:8443/x",
  "file:///etc/passwd",
])("rejects unsafe metadata reference %s before fetching", async (url) => {
  const fetch = upstream();
  expect((await poolImage(request(primary, url))).status).toBe(400);
  expect(fetch).not.toHaveBeenCalled();
});

it("validates redirect destinations instead of redirecting the browser", async () => {
  const fetch = vi.spyOn(globalThis, "fetch").mockResolvedValue(
    new Response(null, {
      status: 302,
      headers: { Location: "http://127.0.0.1/private" },
    }),
  );
  expect((await poolImage(request())).status).toBe(404);
  expect(fetch).toHaveBeenCalledTimes(1);
});

it("bounds redirect chains", async () => {
  const fetch = vi.spyOn(globalThis, "fetch").mockResolvedValue(
    new Response(null, {
      status: 302,
      headers: { Location: "/again" },
    }),
  );
  expect((await poolImage(request())).status).toBe(404);
  expect(fetch).toHaveBeenCalledTimes(4);
});

it("rejects private extended and image targets", async () => {
  for (const doc of [
    JSON.stringify({ extended: "http://127.0.0.1/extended" }),
    JSON.stringify({ info: { url_png_icon_64x64: "http://127.0.0.1/image" } }),
  ]) {
    const fetch = upstream(doc);
    expect((await poolImage(request(doc))).status).toBe(404);
    expect(fetch).toHaveBeenCalledTimes(1);
    fetch.mockRestore();
  }
});

it("rejects HTML advertised as an image and tries the next declared image", async () => {
  const doc = JSON.stringify({
    pool: {
      media_assets: { icon_png_64x64: "./bad.png", logo_png: "./good.png" },
    },
  });
  const fetch = upstream(doc);
  fetch.mockImplementation(async (input) => {
    const path = new URL(String(input)).pathname;
    return path === "/pool.json"
      ? new Response(doc)
      : path === "/bad.png"
        ? new Response("<html>not an image</html>", {
            headers: { "Content-Type": "image/png" },
          })
        : new Response(png);
  });
  const response = await poolImage(request(doc));
  expect(response.status).toBe(200);
  expect(new Uint8Array(await response.arrayBuffer())).toEqual(png);
  expect(fetch).toHaveBeenCalledTimes(3);
});

it("isolates SVG documents with a sandbox and no external resource access", async () => {
  const doc = JSON.stringify({
    pool: { media_assets: { logo_svg: "./logo.svg" } },
  });
  upstream(doc).mockImplementation(
    async (input) =>
      new Response(
        new URL(String(input)).pathname === "/pool.json"
          ? doc
          : '<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>',
      ),
  );
  const response = await poolImage(request(doc));
  expect(response.status).toBe(200);
  expect(response.headers.get("content-type")).toBe("image/svg+xml");
  expect(response.headers.get("content-security-policy")).toContain(
    "sandbox; default-src 'none'",
  );
});

it("limits streamed bodies even when Content-Length is absent", async () => {
  const fetch = upstream();
  fetch.mockResolvedValue(new Response(new Uint8Array(1_048_577)));
  expect((await poolImage(request())).status).toBe(404);
  expect(fetch).toHaveBeenCalledTimes(1);
});

it("does not let an unavailable extended document hide a direct logo", async () => {
  const doc = JSON.stringify({
    info: { url_png_icon_64x64: "./icon.png" },
    extended: "http://127.0.0.1/extended",
  });
  const fetch = upstream(doc);
  expect((await poolImage(request(doc))).status).toBe(200);
  expect(fetch).toHaveBeenCalledTimes(2);
});

it("bounds image bodies independently of metadata", async () => {
  const doc = JSON.stringify({ info: { url_png_icon_64x64: "./large.png" } });
  upstream(doc).mockImplementation(
    async (input) =>
      new Response(
        new URL(String(input)).pathname === "/pool.json"
          ? doc
          : new Uint8Array(2_097_153),
      ),
  );
  expect((await poolImage(request(doc))).status).toBe(404);
});

it("rejects recursive redirects to the image endpoint", async () => {
  const fetch = vi.spyOn(globalThis, "fetch").mockResolvedValue(
    new Response(null, {
      status: 302,
      headers: { Location: "https://demo.pages.dev/pool-image" },
    }),
  );
  expect((await poolImage(request())).status).toBe(404);
  expect(fetch).toHaveBeenCalledTimes(1);
});

it("reuses successful images through the actual Pages route and keeps hashes separate", async () => {
  const fetch = upstream();
  const stored = new Map<string, Response>();
  vi.stubGlobal("caches", {
    open: async () => ({
      match: async (r: Request) => stored.get(r.url)?.clone(),
      put: async (r: Request, response: Response) => {
        stored.set(r.url, response);
      },
    }),
  });
  try {
    const pending: Promise<unknown>[] = [];
    const context = {
      request: request(),
      waitUntil: (p: Promise<unknown>) => {
        pending.push(p);
      },
    };
    expect((await onRequestGet(context)).status).toBe(200);
    await Promise.all(pending);
    const calls = fetch.mock.calls.length;
    expect((await onRequestGet(context)).status).toBe(200);
    expect(fetch).toHaveBeenCalledTimes(calls);
    const changed = new URL(context.request.url);
    changed.searchParams.set("hash", "00".repeat(32));
    expect(
      (await onRequestGet({ ...context, request: new Request(changed) }))
        .status,
    ).toBe(404);
    expect(stored.size).toBe(1);
  } finally {
    vi.unstubAllGlobals();
  }
});
