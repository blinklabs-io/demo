import { CopyButton } from "./CopyButton";
import type { ReactNode } from "react";

export function Panel({
  title,
  children,
  action,
}: {
  title?: ReactNode;
  children: ReactNode;
  action?: ReactNode;
}) {
  return (
    <section className="data-panel">
      {(title || action) && (
        <div className="panel-heading">
          {title && <h2>{title}</h2>}
          {action}
        </div>
      )}
      <div className="panel-content">{children}</div>
    </section>
  );
}

export function Field({ label, value }: { label: string; value: ReactNode }) {
  let url: string | null = null;
  if (typeof value === "string") {
    try {
      const parsed = new URL(value);
      if (
        ["http:", "https:"].includes(parsed.protocol) &&
        !parsed.username &&
        !parsed.password
      )
        url = parsed.href;
    } catch {
      url = null;
    }
  }
  return (
    <div className="data-field">
      <span className="field-label">{label}</span>
      <span className="field-value">
        {value === "Yes" || value === "No" ? (
          <span
            className={`status-badge ${value === "Yes" ? "positive" : "neutral"}`}
          >
            {value}
          </span>
        ) : url ? (
          <a
            href={url}
            target="_blank"
            rel="noreferrer"
            className="text-sky-400 hover:underline"
          >
            {value} ↗
          </a>
        ) : typeof value === "string" &&
          /^(?:[a-fA-F0-9]{40,512}|(?:addr|stake|pool|drep|asset|script|cc_cold|cc_hot)[a-z0-9_]+)$/.test(
            value,
          ) ? (
          <span className="address-identifier address-identifier-full">
            <span className="identifier-text">{value}</span>
            <CopyButton value={value} label={label.toLowerCase()} />
          </span>
        ) : (
          value
        )}
      </span>
    </div>
  );
}
