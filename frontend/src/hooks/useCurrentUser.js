import { useEffect, useState } from "react";
import { getMe } from "../api";

/**
 * useCurrentUser — fetches /users/me once on mount and shares the result.
 *
 * Both the sidebar (footer card) and the topbar (avatar dropdown) need
 * the current user; this hook is just thin enough that two callers each
 * triggering one fetch is acceptable for now. We can promote it to a
 * proper React context later if a third caller appears.
 *
 * Returns { user, loading, error }. user is null until loaded.
 */
export function useCurrentUser() {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    let cancelled = false;
    getMe()
      .then((u) => {
        if (!cancelled) {
          setUser(u);
          setLoading(false);
        }
      })
      .catch((err) => {
        if (!cancelled) {
          setError(err);
          setLoading(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return { user, loading, error };
}

export default useCurrentUser;
