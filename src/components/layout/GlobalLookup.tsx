import { useState, type FormEvent } from "react";
import { useNavigate } from "react-router";
import { detectEntityKind } from "../../lib/lookup";

export function GlobalLookup() {
  const [query, setQuery] = useState("");
  const [notFound, setNotFound] = useState(false);
  const navigate = useNavigate();

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    const result = detectEntityKind(query);
    if (!result) {
      setNotFound(true);
      return;
    }
    setNotFound(false);
    setQuery("");
    navigate(result.route);
  }

  return (
    <form onSubmit={handleSubmit} className="flex-1">
      <input
        type="search"
        aria-label="Global lookup"
        value={query}
        onChange={(event) => {
          setQuery(event.target.value);
          setNotFound(false);
        }}
        placeholder="Search block, tx, address, pool, DRep…"
        className="w-full rounded-md border border-slate-700 bg-slate-900 px-3 py-1.5 text-sm text-slate-100 placeholder:text-slate-500 focus:border-slate-500 focus:outline-none"
      />
      {notFound && (
        <p className="mt-1 text-xs text-red-400">
          Not recognized as a block, tx, address, account, asset, pool, or
          DRep identifier.
        </p>
      )}
    </form>
  );
}
