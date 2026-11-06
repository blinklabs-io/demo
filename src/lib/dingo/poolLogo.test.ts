import { Core } from "@blaze-cardano/sdk";
import { expect, it, vi } from "vitest";
import { readExtendedPoolProfile, readPoolProfile } from "./poolLogo";
function primary(document: Record<string, unknown>) {
  const text = JSON.stringify(document);
  const hash = String(
    Core.blake2b_256(Core.HexBlob.fromBytes(new TextEncoder().encode(text))),
  );
  return { text, hash };
}
it("retains owner and extended documents from the verified owner reference", async () => {
  const metadata = primary({ name: "Owner pool", extended: "extra.json" });
  vi.mocked(fetch)
    .mockResolvedValueOnce(new Response(metadata.text))
    .mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          info: { url_png_icon_64x64: "https://owner.example/logo.png" },
          description: "Owner supplied extended data",
        }),
      ),
    );
  const result = await readPoolProfile(
    "https://owner.example/pool.json",
    metadata.hash,
    new AbortController().signal,
  );
  expect(result.metadata.name).toBe("Owner pool");
  expect(result.extended?.description).toBe("Owner supplied extended data");
  expect(result.logos).toEqual(["https://owner.example/logo.png"]);
  expect(fetch).toHaveBeenCalledTimes(2);
  expect(vi.mocked(fetch).mock.calls[1][0]).toBe(
    "https://owner.example/extra.json",
  );
});
it("retains a direct logo without loading extra social data until requested", async () => {
  const metadata = primary({
    extended: "extra.json",
    info: { url_png_icon_64x64: "https://owner.example/logo.png" },
  });
  vi.mocked(fetch)
    .mockResolvedValueOnce(new Response(metadata.text))
    .mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          info: {
            social: {
              twitter_handle: "@owner",
              github_handle: "owner",
              telegram_handle: "javascript:alert(1)",
            },
            about: { company: "Owner company" },
          },
        }),
      ),
    );
  const result = await readPoolProfile(
    "https://owner.example/pool.json",
    metadata.hash,
    new AbortController().signal,
  );
  expect(result.logos).toContain("https://owner.example/logo.png");
  expect(fetch).toHaveBeenCalledTimes(1);
  const extended = await readExtendedPoolProfile(
    result.extendedUrl!,
    new AbortController().signal,
  );
  expect(extended.links).toEqual([
    { label: "X / Twitter", url: "https://x.com/owner" },
    { label: "GitHub", url: "https://github.com/owner" },
  ]);
  expect(extended.fields).toContainEqual(["Organization", "Owner company"]);
  expect(fetch).toHaveBeenCalledTimes(2);
});
it("rejects modified primary metadata before following its URL or showing its logo", async () => {
  const metadata = primary({
    name: "Authenticated pool",
    extended: "extra.json",
  });
  vi.mocked(fetch)
    .mockResolvedValueOnce(new Response(metadata.text + " "))
    .mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          info: { url_png_icon_64x64: "https://owner.example/changed.png" },
        }),
      ),
    );
  await expect(
    readPoolProfile(
      "https://owner.example/pool.json",
      metadata.hash,
      new AbortController().signal,
    ),
  ).rejects.toThrow("does not match the registered hash");
  expect(fetch).toHaveBeenCalledTimes(1);
});

it("rejects malformed extended profile structures", async () => {
  const metadata = primary({ extended: "extra.json" });
  vi.mocked(fetch)
    .mockResolvedValueOnce(new Response(metadata.text))
    .mockResolvedValueOnce(
      new Response(JSON.stringify({ info: { social: ["invalid"] } })),
    );
  await expect(
    readPoolProfile(
      "https://owner.example/pool.json",
      metadata.hash,
      new AbortController().signal,
    ),
  ).rejects.toThrow("malformed profile fields");
});
