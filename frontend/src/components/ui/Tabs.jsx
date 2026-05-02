import React from "react";
import styles from "./Tabs.module.css";

/**
 * Tabs — controlled tab bar.
 *
 * Pass in `value` (the active tab key), `onChange(key)`, and `tabs` —
 * an array of `{ key, label, count? }`. The component is presentation-
 * only; URL-state binding (e.g. via ?tab=...) is the caller's job, which
 * keeps this primitive reusable for non-routed flows like settings panels.
 */
export function Tabs({ tabs, value, onChange, ariaLabel }) {
  return (
    <div
      role="tablist"
      aria-label={ariaLabel || "Tabs"}
      className={styles.bar}
    >
      {tabs.map((t) => {
        const isActive = t.key === value;
        return (
          <button
            key={t.key}
            type="button"
            role="tab"
            aria-selected={isActive}
            className={`${styles.tab} ${isActive ? styles.active : ""}`.trim()}
            onClick={() => onChange(t.key)}
          >
            <span>{t.label}</span>
            {typeof t.count === "number" && (
              <span className={styles.count}>{t.count}</span>
            )}
          </button>
        );
      })}
    </div>
  );
}

/**
 * TabPanel — renders its children only when `active` is true. Wrap each
 * panel so callers don't have to write `{value === "x" && (...)}`.
 */
export function TabPanel({ active, children }) {
  if (!active) return null;
  return <div role="tabpanel">{children}</div>;
}

export default Tabs;
