import React from "react";
import styles from "./Card.module.css";

/**
 * Card — the dark surface primitive used for every panel/section.
 *
 * Variants:
 *  - default (no prop): static surface, no hover effect
 *  - interactive: lifts + brightens on hover, used when the card is clickable
 *
 * Padding can be overridden via `padding` prop ("sm" | "md" | "lg") or set
 * to "none" when the children supply their own (e.g. tabbed panels).
 */
export function Card({
  as: Tag = "div",
  interactive = false,
  padding = "md",
  className = "",
  children,
  ...rest
}) {
  const cls = [
    styles.card,
    interactive && styles.interactive,
    padding !== "none" && styles[`pad-${padding}`],
    className,
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <Tag className={cls} {...rest}>
      {children}
    </Tag>
  );
}

export function CardHeader({ title, subtitle, action, className = "" }) {
  return (
    <header className={`${styles.header} ${className}`.trim()}>
      <div className={styles.headerText}>
        {title && <h3 className={styles.title}>{title}</h3>}
        {subtitle && <p className={styles.subtitle}>{subtitle}</p>}
      </div>
      {action && <div className={styles.headerAction}>{action}</div>}
    </header>
  );
}

export default Card;
