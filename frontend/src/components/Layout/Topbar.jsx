import React from "react";
import { useLocation } from "react-router-dom";
import { Bell, Search } from "lucide-react";
import { Avatar } from "../ui";
import { useCurrentUser } from "../../hooks/useCurrentUser";
import styles from "./Topbar.module.css";

/**
 * Maps the current route to a page title shown on the left of the topbar.
 * Project detail pages get a generic "Project" until step 5 has the
 * project name available; we'll thread it through then.
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
  const title = deriveTitle(pathname);

  return (
    <header className={styles.topbar}>
      <div className={styles.left}>
        <h1 className={styles.title}>{title}</h1>
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

        <div className={styles.userChip} title={user?.email}>
          <Avatar name={user?.name} email={user?.email} size="sm" />
        </div>
      </div>
    </header>
  );
}

export default Topbar;
