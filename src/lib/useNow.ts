import { useEffect, useState } from "react";

// Calling Date.now() directly during render is impure - React may invoke a
// component body more than once per commit under concurrent rendering, and
// each call could then see a different "now". Components that need a live
// "N seconds ago" value should read it from this hook instead.
export function useNow(intervalMs = 1000): number {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(id);
  }, [intervalMs]);

  return now;
}
