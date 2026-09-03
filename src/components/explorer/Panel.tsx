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
    <section className="rounded-md border border-slate-800 bg-slate-900/40 p-4">
      {(title || action) && (
        <div className="mb-3 flex items-center justify-between">
          {title && (
            <h2 className="text-sm font-semibold text-slate-200">{title}</h2>
          )}
          {action}
        </div>
      )}
      {children}
    </section>
  );
}

export function Field({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="flex flex-col gap-0.5 py-1.5 sm:flex-row sm:items-baseline sm:gap-2">
      <span className="w-40 shrink-0 text-xs uppercase tracking-wide text-slate-500">
        {label}
      </span>
      <span className="min-w-0 break-all text-sm text-slate-200">
        {value}
      </span>
    </div>
  );
}
