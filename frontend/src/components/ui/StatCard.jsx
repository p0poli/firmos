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
  className = "",
}) {
  const intent =
    trendIntent ||
    (trend?.direction === "up" ? "positive" : trend?.direction === "down" ? "negative" : "neutral");

  return (
    <div className={`${styles.statCard} ${className}`.trim()}>
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
