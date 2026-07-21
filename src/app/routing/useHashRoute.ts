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
    function handleHashChange() {
      setRoute(parseHash(window.location.hash));
    }
    // Both events matter: browser back/forward fires both popstate and
    // hashchange for this app's hash-only history entries (harmlessly
    // double-invoking handleHashChange, since setRoute with the same value is
    // a no-op); a plain <a href="#/..."> anchor click fires only hashchange,
    // never popstate. navigate()'s own pushState calls neither, so this only
    // ever handles external changes — no double-handling risk with the
    // setRoute() call in navigate() below.
    window.addEventListener("popstate", handleHashChange);
    window.addEventListener("hashchange", handleHashChange);
    return () => {
      window.removeEventListener("popstate", handleHashChange);
      window.removeEventListener("hashchange", handleHashChange);
    };
  }, []);

  const navigate = useCallback((next: Route) => {
    const hash = serializeRoute(next);
    if (hash !== window.location.hash) {
      window.history.pushState(null, "", hash);
    }
    setRoute(next);
  }, []);

  // Every screen change — including epic-to-epic drill-down within a fight,
  // and browser back/forward — should read from the top, not carry over
  // whatever scroll position the previous screen was left at.
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [route]);

  return { route, navigate };
}
