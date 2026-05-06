/**
 * LockedModule — wraps any content in a blurred overlay when a firm module
 * is inactive.
 *
 * Usage:
 *   <LockedModule
 *     title="Revit Connect"
 *     description="Contact your admin to activate Revit Connect."
 *   >
 *     <RecentChecksCard />
 *   </LockedModule>
 *
 * The children are rendered but blurred so the layout stays stable;
 * the overlay badge floats on top with a lock icon and message.
 */
import React from "react";
import { Lock } from "lucide-react";
import styles from "./LockedModule.module.css";

export function LockedModule({ children, title = "Module locked", description }) {
  return (
    <div className={styles.wrapper} aria-label={`${title} – locked`}>
      {/* Blurred ghost of the real content */}
      <div className={styles.blurLayer} aria-hidden="true">
        {children}
      </div>

      {/* Floating lock badge */}
      <div className={styles.overlay} role="status">
        <span className={styles.lockIcon}>
          <Lock size={22} strokeWidth={2} />
        </span>
        <span className={styles.lockTitle}>{title}</span>
        <span className={styles.lockDesc}>
          {description ?? "Contact your admin to activate this module."}
        </span>
      </div>
    </div>
  );
}

export default LockedModule;
