import { useSyncExternalStore } from "react";
const query = "(max-width: 600px)";
function subscribe(changed: () => void) {
  const media = window.matchMedia(query);
  media.addEventListener("change", changed);
  return () => media.removeEventListener("change", changed);
}
export function useCompactVisual() {
  return useSyncExternalStore(
    subscribe,
    () => window.matchMedia(query).matches,
  );
}
