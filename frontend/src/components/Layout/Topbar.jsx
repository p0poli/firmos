import React, { useEffect, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { Bell, LogOut, Search, Settings as SettingsIcon } from "lucide-react";
import { Avatar } from "../ui";
import { useCurrentUser } from "../../hooks/useCurrentUser";
import { usePageTitleOverride } from "../../contexts/PageTitleContext";
import { logout } from "../../api";
import styles from "./Topbar.module.css";

/**
 * Maps the current route to a default page title shown on the left of
 * the topbar. Pages can override this via usePageTitle() — used by
 * ProjectDetail to surface the actual project name once it loads.
 */
function deriveTitle(pathname) {
  if (pathname === "/" || pathname === "") return "Dashboard";
  if (pathname.startsWith("/portfolio")) return "Portfolio";
  if (pathname.startsWith("/tasks")) return "Tasks";
  if (pathname.startsWith("/gantt")) return "Gantt";
  if (pathname.startsWith("/files")) return "Files";
  if (pathname.startsWith("/knowledge")) return "Knowledge Graph";
  if (pathname.startsWith("/settings")) return "Settings";
  if (pathname.startsWith("/project/")) return "Project";
  return "FirmOS";
}

export function Topbar() {
  const { pathname } = useLocation();
  const { user } = useCurrentUser();
  const { override } = usePageTitleOverride();
  const title = override ?? deriveTitle(pathname);

  // Keep the browser tab in sync with whatever the topbar is showing.
  // Pages that need a dynamic name still call usePageTitle() — this
  // useEffect just covers the static fallback.
  useEffect(() => {
    document.title = title === "FirmOS" ? "FirmOS" : `${title} · FirmOS`;
  }, [title]);

  return (
    <header className={styles.topbar}>
      <div className={styles.left}>
        <h1 className={styles.title} title={title}>
          {title}
        </h1>
      </div>

      <div className={styles.center}>
        {/* Visual stub — there is no /search endpoint yet. The input
            renders, accepts focus, and shows the cmd-K hint, but the
            keystrokes are intentionally not wired anywhere. */}
        <label className={styles.searchWrap}>
          <Search size={14} className={styles.searchIcon} aria-hidden="true" />
          <input
            type="search"
            placeholder="Search projects, tasks, files…"
            className={styles.searchInput}
            aria-label="Search"
          />
          <span className={styles.searchKbd} aria-hidden="true">⌘K</span>
        </label>
      </div>

      <div className={styles.right}>
        {/* Visual stub — no notifications API yet. The dot is illustrative;
            we'll wire a real unread count when the endpoint exists. */}
        <button
          type="button"
          className={styles.iconBtn}
          aria-label="Notifications"
          title="Notifications"
        >
          <Bell size={16} strokeWidth={2} />
          <span className={styles.notifDot} aria-hidden="true" />
        </button>

        <UserMenu user={user} />
      </div>
    </header>
  );
}

// --- user menu ------------------------------------------------------------

function UserMenu({ user }) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef(null);
  const navigate = useNavigate();

  // Close on outside click / Escape so the dropdown feels native.
  useEffect(() => {
    if (!open) return undefined;
    const onDoc = (e) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target)) {
        setOpen(false);
      }
    };
    const onKey = (e) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const handleSettings = () => {
    setOpen(false);
    navigate("/settings");
  };

  const handleLogout = async () => {
    setOpen(false);
    try {
      await logout();
    } finally {
      navigate("/login");
    }
  };

  return (
    <div className={styles.userMenuWrap} ref={wrapRef}>
      <button
        type="button"
        className={styles.userChip}
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
        title={user?.email}
      >
        <Avatar name={user?.name} email={user?.email} size="sm" />
      </button>
      {open && (
        <div role="menu" className={styles.userMenu}>
          {user && (
            <div className={styles.userMenuHeader}>
              <span className={styles.userMenuName}>{user.name}</span>
              <span className={styles.userMenuEmail}>{user.email}</span>
            </div>
          )}
          <button
            type="button"
            role="menuitem"
            className={styles.userMenuItem}
            onClick={handleSettings}
          >
            <SettingsIcon size={14} strokeWidth={2} />
            <span>Settings</span>
          </button>
          <button
            type="button"
            role="menuitem"
            className={styles.userMenuItem}
            onClick={handleLogout}
          >
            <LogOut size={14} strokeWidth={2} />
            <span>Log out</span>
          </button>
        </div>
      )}
    </div>
  );
}

export default Topbar;
