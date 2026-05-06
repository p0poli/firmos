/**
 * UserContext — firm-wide user + role + modules state.
 *
 * Fetches /users/me and /modules/ once on mount (and on explicit refresh).
 * The role is decoded from the JWT payload at login time and cached in
 * localStorage; here we just read that cache so the correct dashboard
 * variant renders without waiting for an extra round-trip.
 *
 * Exported helpers:
 *   useUser()            → { user, role, modules, hasModule, isAdmin,
 *                            isProjectManager, isArchitect, loading, error,
 *                            refresh }
 *   <UserProvider>       → wraps the app tree
 */
import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
} from "react";
import {
  getMe,
  getModules,
  getRole,
  getStoredModules,
  setStoredModules,
} from "../api";

const UserContext = createContext(null);

export function UserProvider({ children }) {
  const [user, setUser] = useState(null);
  // Role is read from localStorage immediately so the dashboard selector
  // picks the right view on first render without a network round-trip.
  const [role, setRole] = useState(() => getRole());
  const [modules, setModulesState] = useState(() => getStoredModules());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  /** Re-fetch user + modules and update all derived state. */
  const refresh = useCallback(async () => {
    try {
      const [u, mods] = await Promise.all([getMe(), getModules()]);
      setUser(u);
      setRole(getRole());
      setModulesState(mods);
      setStoredModules(mods);
    } catch (err) {
      setError(err);
    }
  }, []);

  // Initial load: fetch both in parallel, fail gracefully so a broken
  // /modules/ endpoint doesn't prevent the UI from loading at all.
  useEffect(() => {
    let cancelled = false;
    Promise.allSettled([getMe(), getModules()]).then(([meR, modsR]) => {
      if (cancelled) return;
      if (meR.status === "fulfilled") setUser(meR.value);
      else setError(meR.reason);

      if (modsR.status === "fulfilled") {
        setModulesState(modsR.value);
        setStoredModules(modsR.value);
      }
      // Sync role from localStorage (may have been written by login()).
      setRole(getRole());
      setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  /** True iff the named module is active for this firm. */
  const hasModule = useCallback(
    (key) => {
      const mod = modules.find((m) => m.key === key);
      return mod?.is_active === true;
    },
    [modules]
  );

  const isAdmin = role === "admin";
  const isProjectManager = role === "project_manager";
  const isArchitect = role === "architect";

  return (
    <UserContext.Provider
      value={{
        user,
        role,
        modules,
        hasModule,
        isAdmin,
        isProjectManager,
        isArchitect,
        loading,
        error,
        refresh,
      }}
    >
      {children}
    </UserContext.Provider>
  );
}

/**
 * useUser — consume the UserContext.
 * Must be called inside a component tree wrapped by <UserProvider>.
 */
export function useUser() {
  const ctx = useContext(UserContext);
  if (ctx === null)
    throw new Error("useUser() must be called inside <UserProvider>");
  return ctx;
}

export default UserContext;
