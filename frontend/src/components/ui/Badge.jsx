import React from "react";
import styles from "./Badge.module.css";

/**
 * Badge — small pill for labelling status / state.
 *
 * variant maps to a token combo:
 *   active     → primary tint
 *   on-hold    → warning tint
 *   completed  → success tint
 *   archived   → neutral tint
 *   success / warning / danger / neutral / primary  — direct semantic
 *
 * The component normalises status strings coming from the API
 * (e.g. "on-hold", "in-progress", "passed") so callers can pass the
 * raw API value without translating.
 */
const STATUS_TO_VARIANT = {
  // Project statuses
  active: "primary",
  "on-hold": "warning",
  completed: "success",
  archived: "neutral",
  // Task statuses
  todo: "neutral",
  "in-progress": "primary",
  review: "warning",
  done: "success",
  // Check statuses (and their human variants)
  pass: "success",
  passed: "success",
  fail: "danger",
  failed: "danger",
  warning: "warning",
  // Priorities
  low: "neutral",
  medium: "warning",
  high: "danger",
};

export function Badge({
  variant,
  status,
  size = "md",
  dot = false,
  children,
  className = "",
}) {
  const resolved =
    variant || (status && STATUS_TO_VARIANT[status]) || "neutral";

  const cls = [
    styles.badge,
    styles[`variant-${resolved}`],
    styles[`size-${size}`],
    className,
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <span className={cls}>
      {dot && <span className={styles.dot} aria-hidden="true" />}
      {children ?? status}
    </span>
  );
}

export default Badge;
