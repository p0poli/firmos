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

/** Persist the canonical role returned by /users/me to localStorage. */
function syncRole(userObj) {
  if (userObj?.role) {
    localStorage.setItem("firmos_role", userObj.role);
  }
}

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
      // /users/me is the DB source of truth — prefer it over the JWT cache.
      syncRole(u);
      setRole(u?.role ?? getRole());
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
      if (meR.status === "fulfilled") {
        const u = meR.value;
        setUser(u);
        // Use the role from the DB (/users/me) as the canonical value;
        // write it back to localStorage so subsequent renders are instant.
        syncRole(u);
        setRole(u?.role ?? getRole());
      } else {
        setError(meR.reason);
      }

      if (modsR.status === "fulfilled") {
        setModulesState(modsR.value);
        setStoredModules(modsR.value);
      }
      setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  /**
   * True iff the named module is active for this firm.
   * The API returns `module_key` (not `key`) — match on that field.
   */
  const hasModule = useCallback(
    (key) => {
      const mod = modules.find((m) => m.module_key === key);
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
