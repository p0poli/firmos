import React from "react";
import styles from "./ProgressBar.module.css";

/**
 * ProgressBar — thin progress indicator.
 *
 * `value` and `max` follow the <progress> element convention. The fill
 * color picks from the `intent` prop ("primary" | "success" | "warning" |
 * "danger" | "neutral"). When `showLabel` is true the percent + ratio
 * appear above the bar.
 */
export function ProgressBar({
  value = 0,
  max = 100,
  intent = "primary",
  showLabel = false,
  label,
  className = "",
}) {
  const safeMax = Math.max(1, max);
  const safeValue = Math.max(0, Math.min(value, safeMax));
  const percent = Math.round((safeValue / safeMax) * 100);

  return (
    <div className={`${styles.wrapper} ${className}`.trim()}>
      {(showLabel || label) && (
        <div className={styles.row}>
          <span className={styles.label}>
            {label ?? `${safeValue} / ${safeMax}`}
          </span>
          <span className={styles.percent}>{percent}%</span>
        </div>
      )}
      <div
        className={styles.track}
        role="progressbar"
        aria-valuenow={safeValue}
        aria-valuemin={0}
        aria-valuemax={safeMax}
      >
        <div
          className={`${styles.fill} ${styles[`intent-${intent}`]}`}
          style={{ width: `${percent}%` }}
        />
      </div>
    </div>
  );
}

export default ProgressBar;
