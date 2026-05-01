import React from "react";
import styles from "./Button.module.css";

/**
 * Button — primary action element.
 *
 * Variants:
 *   primary    indigo fill, used for the dominant action on a screen
 *   secondary  surface fill with border, used for secondary actions
 *   ghost      transparent, used inside cards / for tertiary actions
 *   danger     red fill, used for destructive actions
 *   icon       square, designed to host a single icon (16-20px)
 *
 * Sizes: sm | md (default) | lg
 *
 * Pass `as="a"` (or `as={Link}`) to render as something other than a button
 * — useful for nav links that visually look like buttons.
 */
export const Button = React.forwardRef(function Button(
  {
    as: Tag = "button",
    variant = "primary",
    size = "md",
    leadingIcon,
    trailingIcon,
    fullWidth = false,
    className = "",
    children,
    type,
    ...rest
  },
  ref
) {
  const cls = [
    styles.button,
    styles[`variant-${variant}`],
    styles[`size-${size}`],
    fullWidth && styles.fullWidth,
    className,
  ]
    .filter(Boolean)
    .join(" ");

  // Default `type=button` on <button> elements so they don't accidentally
  // submit forms — opt in to type="submit" when needed.
  const finalType = Tag === "button" ? type ?? "button" : undefined;

  return (
    <Tag ref={ref} className={cls} type={finalType} {...rest}>
      {leadingIcon && <span className={styles.iconSlot}>{leadingIcon}</span>}
      {children && <span className={styles.label}>{children}</span>}
      {trailingIcon && <span className={styles.iconSlot}>{trailingIcon}</span>}
    </Tag>
  );
});

export default Button;
