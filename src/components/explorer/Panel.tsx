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
        ) : (
          value
        )}
      </span>
    </div>
  );
}
