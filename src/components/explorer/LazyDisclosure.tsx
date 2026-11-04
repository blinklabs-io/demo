import { useState, type ReactNode } from "react";

export function LazyDisclosure({
  title,
  children,
  className = "detail-disclosure",
}: {
  title: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  return (
    <details
      className={className}
      onToggle={(event) => setOpen(event.currentTarget.open)}
    >
      <summary>{title}</summary>
      {open && children}
    </details>
  );
}
