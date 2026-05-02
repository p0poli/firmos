import React from "react";
import { useNavigate } from "react-router-dom";
import {
  BarChart3,
  Folder,
  Home,
  LayoutGrid,
  ListChecks,
  LogOut,
  Network,
  Settings as SettingsIcon,
  Squircle,
} from "lucide-react";
import { Avatar } from "../ui";
import { logout } from "../../api";
import { useCurrentUser } from "../../hooks/useCurrentUser";
import { SidebarNavItem } from "./SidebarNavItem";
import styles from "./Sidebar.module.css";

const NAV_ITEMS = [
  { to: "/", icon: Home, label: "Dashboard", end: true },
  { to: "/portfolio", icon: LayoutGrid, label: "Portfolio" },
  { to: "/tasks", icon: ListChecks, label: "Tasks" },
  { to: "/gantt", icon: BarChart3, label: "Gantt" },
  { to: "/files", icon: Folder, label: "Files" },
  { to: "/knowledge", icon: Network, label: "Knowledge Graph" },
  { to: "/settings", icon: SettingsIcon, label: "Settings" },
];

export function Sidebar() {
  const navigate = useNavigate();
  const { user, loading } = useCurrentUser();

  const handleLogout = async () => {
    try {
      await logout();
    } finally {
      navigate("/login", { replace: true });
    }
  };

  return (
    <aside className={styles.sidebar} aria-label="Primary">
      <div className={styles.brand}>
        <span className={styles.brandMark} aria-hidden="true">
          <Squircle size={18} strokeWidth={2.5} />
        </span>
        <span className={styles.brandWord}>FirmOS</span>
      </div>

      <nav className={styles.nav}>
        {NAV_ITEMS.map((item) => (
          <SidebarNavItem key={item.to} {...item} />
        ))}
      </nav>

      <div className={styles.footer}>
        <div className={styles.userCard}>
          <Avatar
            name={user?.name}
            email={user?.email}
            size="md"
          />
          <div className={styles.userMeta}>
            <span className={styles.userName}>
              {loading ? "…" : user?.name ?? "Signed in"}
            </span>
            {user?.email && (
              <span className={styles.userEmail}>{user.email}</span>
            )}
          </div>
          <button
            type="button"
            onClick={handleLogout}
            title="Log out"
            className={styles.logoutBtn}
            aria-label="Log out"
          >
            <LogOut size={16} strokeWidth={2} />
          </button>
        </div>
      </div>
    </aside>
  );
}

export default Sidebar;
