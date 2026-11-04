import { useContext, useLayoutEffect, useMemo, useRef, useState } from "react";
import { UNSAFE_DataRouterContext, useLocation } from "react-router";

export function useDraftGuard(key: string): () => void {
  const router = useContext(UNSAFE_DataRouterContext)?.router;
  const location = useLocation();
  const route = location.pathname + location.search;
  const [navigationRevision, setNavigationRevision] = useState(0);
  const token = useMemo(
    () => ({ key, route, navigationRevision }),
    [key, route, navigationRevision],
  );
  const current = useRef<object | null>(token);
  useLayoutEffect(() => {
    current.current = token;
    return () => {
      current.current = null;
    };
  }, [token]);
  useLayoutEffect(() => {
    if (!router) return;
    let previous = router.state.location;
    return router.subscribe(({ location: next }) => {
      const sameRoute =
        previous.pathname === next.pathname && previous.search === next.search;
      const changed = !sameRoute || previous.key !== next.key;
      const anchorOnly = sameRoute && previous.hash !== next.hash;
      previous = next;
      if (changed && !anchorOnly) {
        // Router navigation can precede React's transition/unmount commit.
        current.current = null;
        setNavigationRevision((revision) => revision + 1);
      }
    });
  }, [router]);
  return () => {
    const activeRoute = router
      ? router.state.location.pathname + router.state.location.search
      : route;
    if (current.current !== token || activeRoute !== token.route)
      throw new Error("Draft details changed. Review a new transaction.");
  };
}
