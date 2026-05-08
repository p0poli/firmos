import React from "react";
import { Outlet } from "react-router-dom";
import { ChatPanel, ChatToggleButton } from "../Chat";
import { Sidebar } from "./Sidebar";
import { Topbar } from "./Topbar";
import styles from "./Layout.module.css";

/**
 * Layout — app shell for every authenticated route.
 *
 *   ┌──────────┬─────────────────────────┬──────────┐
 *   │          │  Topbar                  │          │
 *   │ Sidebar  ├─────────────────────────┤  Chat    │
 *   │          │  <Outlet />              │  Panel   │
 *   │          │   (24px padding)         │ (320px)  │
 *   └──────────┴─────────────────────────┴──────────┘
 *
 * The sidebar is sticky-full-height; the topbar is sticky to the top of
 * the right column. The content column scrolls; the sidebar/topbar do
 * not. The chat panel is a flex sibling of .column — slides in from the
 * right and pushes the content column left (no overlay).
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
      <ChatPanel />
      <ChatToggleButton />
    </div>
  );
}
