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
      <span aria-live="polite">
        {status === "copied"
          ? "Copied"
          : status === "error"
            ? "Copy failed"
            : "Copy"}
      </span>
    </button>
  );
}
