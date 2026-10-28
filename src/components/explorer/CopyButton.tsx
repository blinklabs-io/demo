import { useEffect, useState } from "react";

async function copyText(value: string) {
  if (window.isSecureContext && navigator.clipboard) {
    await navigator.clipboard.writeText(value);
    return;
  }
  // Clipboard API access requires HTTPS; LAN HTTP previews still support user-triggered copy.
  const previous = document.activeElement;
  const field = document.createElement("textarea");
  field.value = value;
  field.readOnly = true;
  field.style.cssText = "position:fixed;left:-9999px;top:0";
  document.body.append(field);
  try {
    field.select();
    if (!document.execCommand("copy")) throw new Error("Copy failed");
  } finally {
    field.remove();
    if (previous instanceof HTMLElement)
      previous.focus({ preventScroll: true });
  }
}

export function CopyButton({
  value,
  label = "address",
}: {
  value: string;
  label?: string;
}) {
  const [status, setStatus] = useState<"idle" | "copied" | "error">("idle");
  useEffect(() => {
    if (status === "idle") return;
    const timeout = window.setTimeout(() => setStatus("idle"), 2500);
    return () => window.clearTimeout(timeout);
  }, [status]);
  return (
    <button
      type="button"
      className="copy-identifier"
      aria-label={`Copy full ${label}`}
      title={`Copy full ${label}`}
      onClick={async () => {
        try {
          await copyText(value);
          setStatus("copied");
        } catch {
          setStatus("error");
        }
      }}
    >
      <svg
        aria-hidden="true"
        width="16"
        height="16"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        {status === "copied" ? (
          <path d="m5 12 4 4L19 6" />
        ) : status === "error" ? (
          <>
            <path d="m6 6 12 12M6 18 18 6" />
          </>
        ) : (
          <>
            <rect x="8" y="8" width="12" height="12" rx="2" />
            <path d="M16 8V4H4v12h4" />
          </>
        )}
      </svg>
      <span className="sr-only" aria-live="polite">
        {status === "copied"
          ? "Copied"
          : status === "error"
            ? "Copy failed"
            : ""}
      </span>
    </button>
  );
}
