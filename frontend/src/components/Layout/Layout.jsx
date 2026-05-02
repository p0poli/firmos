import React from "react";
import { Outlet } from "react-router-dom";
import { Sidebar } from "./Sidebar";
import { Topbar } from "./Topbar";
import styles from "./Layout.module.css";

/**
 * Layout — app shell for every authenticated route.
 *
 *   ┌──────────┬─────────────────────────┐
 *   │          │  Topbar                  │
 *   │ Sidebar  ├─────────────────────────┤
 *   │          │  <Outlet />              │
 *   │          │   (24px padding)         │
 *   └──────────┴─────────────────────────┘
 *
 * The sidebar is sticky-full-height; the topbar is sticky to the top of
 * the right column. The content column scrolls; the sidebar/topbar do
 * not.
 */
export default function Layout() {
  return (
    <div className={styles.shell}>
      <Sidebar />
      <div className={styles.column}>
        <Topbar />
        <main className={styles.content}>
          <Outlet />
        </main>
      </div>
    </div>
  );
}
