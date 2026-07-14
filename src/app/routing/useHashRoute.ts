import { useCallback, useEffect, useState } from "react";
import { parseHash, serializeRoute, type Route } from "./hashRoute";

export function useHashRoute(): {
  route: Route;
  navigate: (next: Route) => void;
} {
  const [route, setRoute] = useState<Route>(() =>
    parseHash(window.location.hash),
  );

  useEffect(() => {
    function handlePopState() {
      setRoute(parseHash(window.location.hash));
    }
    window.addEventListener("popstate", handlePopState);
    return () => window.removeEventListener("popstate", handlePopState);
  }, []);

  const navigate = useCallback((next: Route) => {
    const hash = serializeRoute(next);
    if (hash !== window.location.hash) {
      window.history.pushState(null, "", hash);
    }
    setRoute(next);
  }, []);

  return { route, navigate };
}
