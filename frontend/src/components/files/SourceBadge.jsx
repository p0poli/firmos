import React from "react";
import { Badge } from "../ui";
import styles from "./SourceBadge.module.css";

/**
 * SourceBadge — colored chip for a file's origin.
 *
 *   BIM360    indigo (uses the primary variant straight)
 *   ACC       purple (override on top of the primary variant — purple
 *             isn't in the token palette and isn't worth promoting yet)
 *   uploaded  neutral gray
 *
 * Width is fixed via .badge so file names align in a column when
 * SourceBadge is the leading element of a row.
 */
export function SourceBadge({ source }) {
  const variant = source === "uploaded" ? "neutral" : "primary";
  const isAcc = source === "ACC";
  return (
    <Badge
      variant={variant}
      size="sm"
      className={`${styles.badge} ${isAcc ? styles.acc : ""}`.trim()}
    >
      {source}
    </Badge>
  );
}

export default SourceBadge;
