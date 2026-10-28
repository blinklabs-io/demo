import { useState } from "react";
export function SurveyIntegerInput({
  value,
  onChange,
  label,
}: {
  value: number | undefined;
  onChange: (value: number | undefined) => void;
  label?: string;
}) {
  const [draft, setDraft] = useState({
    source: value,
    text: value === undefined ? "" : String(value),
  });
  if (!Object.is(draft.source, value))
    setDraft({
      source: value,
      text:
        value === undefined
          ? ""
          : Number.isFinite(value)
            ? String(value)
            : draft.text,
    });
  return (
    <input
      type="text"
      inputMode="numeric"
      aria-label={label}
      value={draft.text}
      onChange={(event) => {
        const raw = event.target.value;
        const parsed = raw.trim() === "" ? undefined : Number(raw);
        setDraft({ source: parsed, text: raw });
        onChange(parsed);
      }}
    />
  );
}
