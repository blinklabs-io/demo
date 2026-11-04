import { useState } from "react";
import {
  buildCip25,
  importCip25,
  metadataJson,
  tokenArtwork,
  type Cip25Draft,
} from "../../lib/tools/cip25";
export function Cip25Editor({
  assetName,
  description,
  value,
  onChange,
  onDescription,
}: {
  assetName: string;
  description: string;
  value: Cip25Draft;
  onChange: (value: Cip25Draft) => void;
  onDescription: (value: string) => void;
}) {
  const [importError, setImportError] = useState(""),
    [loadedImage, setLoadedImage] = useState("");
  let json = "",
    error = "";
  try {
    if (assetName || value.displayName)
      json = metadataJson(buildCip25(assetName, description, value));
  } catch (e) {
    error = (e as Error).message;
  }
  const update = (patch: Partial<Cip25Draft>) =>
    onChange({ ...value, ...patch });
  const image =
    value.artwork === "generated"
      ? tokenArtwork(value.displayName || assetName || "✦")
      : value.image;
  const browserImage =
    /^https?:\/\//.test(image) || /^data:image\//.test(image);
  async function load(file: File) {
    try {
      if (file.size > 32768) throw new Error("Metadata import exceeds 32 KiB.");
      const result = importCip25(await file.text());
      onChange(result.draft);
      onDescription(result.description);
      setImportError("");
    } catch (e) {
      setImportError((e as Error).message);
    }
  }
  function download() {
    const url = URL.createObjectURL(
      new Blob([json], { type: "application/json" }),
    );
    const a = document.createElement("a");
    a.href = url;
    a.download = "asset-metadata.json";
    a.click();
    URL.revokeObjectURL(url);
  }
  return (
    <section className="cip25-editor">
      <header>
        <div>
          <span className="eyebrow">CIP-25 · version 1</span>
          <h3>Give your token an identity.</h3>
        </div>
        <span className="metadata-size">
          {new TextEncoder().encode(json).length.toLocaleString()} / 8,192 bytes
        </span>
      </header>
      <div className="metadata-artwork">
        <div className="metadata-artwork-frame">
          {value.artwork === "generated" ||
          (loadedImage === image && browserImage) ? (
            <img
              src={image}
              alt="Token artwork preview"
              referrerPolicy="no-referrer"
              onError={() => setLoadedImage("")}
            />
          ) : (
            <>
              <span aria-hidden="true">✦</span>
              <small>
                {image.startsWith("ipfs:")
                  ? "IPFS artwork"
                  : image.startsWith("ar:")
                    ? "Arweave artwork"
                    : "Artwork URI"}
              </small>
            </>
          )}
        </div>
        <div>
          <label>
            Display name
            <input
              aria-label="Metadata display name"
              value={value.displayName}
              placeholder={assetName || "Token display name"}
              onChange={(e) => update({ displayName: e.target.value })}
            />
            <small>
              Leave blank to use the asset name. Maximum 64 UTF-8 bytes.
            </small>
          </label>
          <label>
            Artwork
            <select
              aria-label="Artwork source"
              value={value.artwork}
              onChange={(e) =>
                update({ artwork: e.target.value as Cip25Draft["artwork"] })
              }
            >
              <option value="generated">Generated artwork</option>
              <option value="uri">Published artwork URI</option>
            </select>
          </label>
        </div>
      </div>
      {value.artwork === "uri" && (
        <>
          <label>
            Image URI
            <input
              aria-label="Image URI"
              value={value.image}
              onChange={(e) => update({ image: e.target.value })}
              placeholder="ipfs://… or https://…"
            />
          </label>
          <label>
            Image media type
            <input
              aria-label="Image media type"
              value={value.mediaType}
              onChange={(e) => update({ mediaType: e.target.value })}
              placeholder="image/png"
            />
          </label>
          {browserImage && (
            <button type="button" onClick={() => setLoadedImage(image)}>
              Load artwork preview
            </button>
          )}
          <p className="metadata-hint">
            Use published media. IPFS and Arweave references are stored as
            supplied; files are not uploaded by this tool.
          </p>
        </>
      )}
      <label>
        Public description
        <textarea
          aria-label="Public description"
          rows={3}
          value={description}
          onChange={(e) => onDescription(e.target.value)}
        />
        <small>
          {new TextEncoder().encode(description).length} / 512 UTF-8 bytes
        </small>
      </label>
      <div className="metadata-files-heading">
        <h4>
          Attached files <span>{value.files.length} / 8</span>
        </h4>
        <button
          type="button"
          disabled={value.files.length >= 8}
          onClick={() =>
            update({
              files: [...value.files, { name: "", mediaType: "", src: "" }],
            })
          }
        >
          + File reference
        </button>
      </div>
      {value.files.map((f, i) => (
        <div className="metadata-file" key={i}>
          <header>
            <span>File {i + 1}</span>
            <button
              type="button"
              aria-label={`Remove file ${i + 1}`}
              onClick={() =>
                update({ files: value.files.filter((_, n) => n !== i) })
              }
            >
              ×
            </button>
          </header>
          {(
            [
              { key: "name", label: "File name", hint: "Artwork" },
              { key: "mediaType", label: "File media type", hint: "image/png" },
              { key: "src", label: "File source URI", hint: "ipfs://…" },
            ] as const
          ).map((field) => (
            <label key={field.key}>
              {field.label}
              <input
                aria-label={`${field.label} ${i + 1}`}
                placeholder={field.hint}
                value={f[field.key]}
                onChange={(e) =>
                  update({
                    files: value.files.map((row, n) =>
                      n === i ? { ...row, [field.key]: e.target.value } : row,
                    ),
                  })
                }
              />
            </label>
          ))}
          <details>
            <summary>Additional file properties</summary>
            <textarea
              aria-label={`Custom file properties ${i + 1}`}
              className="metadata-code"
              rows={3}
              value={f.properties || "{}"}
              onChange={(e) =>
                update({
                  files: value.files.map((row, n) =>
                    n === i ? { ...row, properties: e.target.value } : row,
                  ),
                })
              }
            />
          </details>
        </div>
      ))}
      <label>
        Custom properties · JSON object
        <textarea
          aria-label="Custom metadata properties"
          className="metadata-code"
          rows={5}
          spellCheck={false}
          value={value.properties}
          onChange={(e) => update({ properties: e.target.value })}
        />
        <small>
          Text, integers, lists and objects. Custom text and keys must fit 64
          UTF-8 bytes; use explicit text chunks for longer values. Standard
          image, description and file URIs are chunked automatically.
        </small>
      </label>
      <div className="metadata-import-export">
        <label className="metadata-import">
          Import per-asset JSON
          <input
            type="file"
            aria-label="Import per-asset metadata"
            accept="application/json,.json"
            onChange={(e) => {
              if (e.target.files?.[0]) void load(e.target.files[0]);
              e.target.value = "";
            }}
          />
        </label>
        <button type="button" onClick={download} disabled={!json || !!error}>
          Export metadata JSON
        </button>
      </div>
      <p className="metadata-hint">
        Import the asset’s object with name and image fields. The policy ID and
        asset-name wrapper are added to label 721 when the transaction is built.
      </p>
      {(error || importError) && (
        <p className="tool-error" role="alert">
          {importError || error}
        </p>
      )}
      <details className="metadata-json">
        <summary>Preview on-chain asset metadata</summary>
        <pre>{json || "Complete the metadata fields to preview."}</pre>
      </details>
    </section>
  );
}
