import React from "react";
import { ArrowDownRight, ArrowUpRight } from "lucide-react";
import styles from "./StatCard.module.css";

/**
 * StatCard — large number with a label, optional trend indicator, optional
 * icon. Used in dashboard summary rows.
 *
 * trend = { value: number, direction: "up" | "down", label: string }
 *  - direction colors the arrow (up=success, down=danger)
 *  - You can override the implied semantic via `trendIntent`
 *    ("positive" | "negative" | "neutral") — useful when "up" is bad
 *    (e.g. "overdue tasks went up").
 */
export function StatCard({
  label,
  value,
  icon,
  trend,
  trendIntent,
  /** Native tooltip shown on hover (uses title attribute — no extra library). */
  tooltip,
  /** When provided the card becomes interactive: pointer cursor + hover lift. */
  onClick,
  className = "",
}) {
  const intent =
    trendIntent ||
    (trend?.direction === "up" ? "positive" : trend?.direction === "down" ? "negative" : "neutral");

  const interactive = Boolean(onClick);

  return (
    <div
      className={`${styles.statCard} ${interactive ? styles.interactive : ""} ${className}`.trim()}
      onClick={onClick}
      title={tooltip}
      role={interactive ? "button" : undefined}
      tabIndex={interactive ? 0 : undefined}
      onKeyDown={
        interactive
          ? (e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                onClick(e);
              }
            }
          : undefined
      }
    >
      <div className={styles.row}>
        <span className={styles.label}>{label}</span>
        {icon && <span className={styles.icon}>{icon}</span>}
      </div>
      <div className={styles.value}>{value}</div>
      {trend && (
        <div className={`${styles.trend} ${styles[`trend-${intent}`]}`}>
          {trend.direction === "up" ? (
            <ArrowUpRight size={14} />
          ) : (
            <ArrowDownRight size={14} />
          )}
          <span>{trend.value}</span>
          {trend.label && <span className={styles.trendLabel}>{trend.label}</span>}
        </div>
      )}
    </div>
  );
}

export default StatCard;
