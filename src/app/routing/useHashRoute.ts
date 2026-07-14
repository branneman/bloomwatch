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
    // Re-sync immediately on mount, not just on future popstate events: the
    // hash may already have changed between the initial useState() read
    // above and this effect registering its listener (e.g. useWclAuth's
    // OAuth-return flow restores a shared link's hash via
    // history.replaceState and dispatches a synthetic popstate from its own
    // mount effect, which can race ahead of this listener registering if
    // useWclAuth is called before useHashRoute in the parent component).
    // Re-deriving here makes this hook correct regardless of hook order or
    // what changed the hash in between — not dependent on a popstate ever
    // firing for it. This is synchronizing React state with an external
    // system (window.location.hash) that can change independent of React
    // between the initial useState() read and this effect mounting; a
    // subscribe-in-effect alone (the popstate listener below) isn't
    // sufficient since not everything that changes the hash also fires
    // popstate (e.g. history.replaceState).
    // eslint-disable-next-line react-hooks/set-state-in-effect -- see comment above; this isn't the "adjusting state" anti-pattern the rule targets.
    setRoute(parseHash(window.location.hash));
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
