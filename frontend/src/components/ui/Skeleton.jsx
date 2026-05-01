import React from "react";
import styles from "./Skeleton.module.css";

/**
 * Skeleton — shimmer placeholder for loading states.
 *
 * Two variants:
 *   rect (default) — give it width + height
 *   text           — gives it the line-height of body text and 80% width
 *                    so multiple stacked Skeletons read as fake paragraphs
 *
 * Compose multiple in a stack with <SkeletonGroup count={3} /> when you
 * want a list-of-items placeholder.
 */
export function Skeleton({
  width,
  height,
  variant = "rect",
  radius,
  className = "",
  style,
}) {
  const inlineStyle = {
    width: width,
    height: height,
    borderRadius: radius,
    ...style,
  };

  return (
    <span
      className={`${styles.skeleton} ${styles[`variant-${variant}`]} ${className}`.trim()}
      style={inlineStyle}
      aria-hidden="true"
    />
  );
}

export function SkeletonGroup({ count = 3, gap = 8, children }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap }}>
      {children
        ? Array.from({ length: count }, (_, i) => (
            <React.Fragment key={i}>{children}</React.Fragment>
          ))
        : Array.from({ length: count }, (_, i) => (
            <Skeleton key={i} variant="text" />
          ))}
    </div>
  );
}

export default Skeleton;
