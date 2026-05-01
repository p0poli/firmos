import React from "react";
import styles from "./EmptyState.module.css";

/**
 * EmptyState — used when a list / section has no data.
 *
 * Pass a lucide icon component to `icon` (just the component, not an
 * instance — the EmptyState will size it). `action` is an optional slot
 * for a CTA button.
 */
export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
  size = "md",
  className = "",
}) {
  return (
    <div
      className={`${styles.empty} ${styles[`size-${size}`]} ${className}`.trim()}
    >
      {Icon && (
        <span className={styles.iconWrap}>
          <Icon size={size === "sm" ? 18 : 24} strokeWidth={1.5} />
        </span>
      )}
      {title && <h4 className={styles.title}>{title}</h4>}
      {description && <p className={styles.description}>{description}</p>}
      {action && <div className={styles.action}>{action}</div>}
    </div>
  );
}

export default EmptyState;
