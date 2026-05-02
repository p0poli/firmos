import React from "react";
import { NavLink } from "react-router-dom";
import styles from "./SidebarNavItem.module.css";

/**
 * SidebarNavItem — a single rail link.
 *
 * Renders a NavLink so React Router applies the `active` class via its
 * className-as-function API. Icon + label layout; the label hides on
 * narrow viewports (CSS-only collapse, see Sidebar.module.css media
 * query at ≤960px).
 *
 * Props:
 *   to: route path
 *   icon: lucide icon component (not an instance)
 *   label: string
 *   end: boolean — passed straight to NavLink for exact-match (used on "/")
 */
export function SidebarNavItem({ to, icon: Icon, label, end = false }) {
  return (
    <NavLink
      to={to}
      end={end}
      title={label}
      className={({ isActive }) =>
        `${styles.item} ${isActive ? styles.active : ""}`.trim()
      }
    >
      {Icon && (
        <span className={styles.iconSlot}>
          <Icon size={18} strokeWidth={2} />
        </span>
      )}
      <span className={styles.label}>{label}</span>
    </NavLink>
  );
}

export default SidebarNavItem;
