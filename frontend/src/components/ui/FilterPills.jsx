import React from "react";
import styles from "./FilterPills.module.css";

/**
 * FilterPills — single-select pill row used for status / scope filters.
 *
 * Pass a flat list of options; each option is rendered as a pill, with
 * the active one highlighted. Optional `count` per option renders as a
 * small numeric chip after the label so the user sees the cardinality of
 * each bucket without having to switch filters.
 *
 *   options = [
 *     { value: null, label: "All" },
 *     { value: "active", label: "Active", count: 2 },
 *     ...
 *   ]
 *
 * `value === null` is treated as "no filter" — the "All" option above.
 * Comparing with strict equality so callers can use any primitive type.
 */
export function FilterPills({ options, value, onChange, ariaLabel }) {
  return (
    <div
      role="tablist"
      aria-label={ariaLabel || "Filter"}
      className={styles.row}
    >
      {options.map((opt) => {
        const isActive = opt.value === value;
        return (
          <button
            key={String(opt.value)}
            type="button"
            role="tab"
            aria-selected={isActive}
            className={`${styles.pill} ${isActive ? styles.active : ""}`.trim()}
            onClick={() => onChange(opt.value)}
          >
            <span>{opt.label}</span>
            {typeof opt.count === "number" && (
              <span className={styles.count}>{opt.count}</span>
            )}
          </button>
        );
      })}
    </div>
  );
}

export default FilterPills;
