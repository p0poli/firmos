import { useUser } from "../contexts/UserContext";

/**
 * useCurrentUser — thin wrapper around UserContext.
 *
 * Returns { user, loading, error } for backward-compat with every existing
 * caller (Sidebar, Topbar). The full context (role, modules, hasModule, …)
 * is available via useUser() for components that need it.
 */
export function useCurrentUser() {
  const { user, loading, error } = useUser();
  return { user, loading, error };
}

export default useCurrentUser;
