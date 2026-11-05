import { DINGO_NETWORK } from "./dingo/config";
import { useContext, useLayoutEffect, useMemo, useRef, useState } from "react";
import { NavigationType, UNSAFE_DataRouterContext, useLocation } from "react-router";

function routeIdentity(location: { pathname: string; search: string }) {
  const params = new URLSearchParams(location.search);
  const networks = params.getAll("network");
  const currentNetwork = networks.length === 0 || (networks.length === 1 && networks[0] === DINGO_NETWORK.id);
  if (currentNetwork) params.delete("network");
  return { route: location.pathname + `?${params.toString()}`, currentNetwork, networkPresent: networks.length > 0 };
}

export function useDraftGuard(key: string): () => void {
  const router = useContext(UNSAFE_DataRouterContext)?.router;
  const location = useLocation();
  const route = routeIdentity(location).route;
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
    return router.subscribe(({ location: next, historyAction }) => {
      const before = routeIdentity(previous), after = routeIdentity(next);
      const sameRoute = before.route === after.route;
      const canonicalMetadata = historyAction === NavigationType.Replace && previous.state === next.state && sameRoute && before.currentNetwork && after.currentNetwork && before.networkPresent !== after.networkPresent;
      const changed = !sameRoute || previous.key !== next.key || previous.state !== next.state;
      const anchorOnly = sameRoute && previous.search === next.search && previous.state === next.state && previous.hash !== next.hash;
      previous = next;
      if (changed && !anchorOnly && !canonicalMetadata) {
        // Router navigation can precede React's transition/unmount commit.
        current.current = null;
        setNavigationRevision((revision) => revision + 1);
      }
    });
  }, [router]);
  return () => {
    const activeRoute = router
      ? routeIdentity(router.state.location).route
      : route;
    if (current.current !== token || activeRoute !== token.route)
      throw new Error("Draft details changed. Review a new transaction.");
  };
}
