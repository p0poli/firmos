import React from "react";
import styles from "./Avatar.module.css";

/**
 * Avatar — initial-based circular badge for a user.
 *
 * Color is derived from a stable hash of the seed string (typically email
 * or name) so the same user always lands on the same color across the app
 * without needing per-user color storage.
 *
 * Sizes: xs (16) | sm (20) | md (28) | lg (40)
 */
const PALETTE = [
  "#5865f2", // indigo (matches primary)
  "#22c55e", // emerald
  "#f59e0b", // amber
  "#ef4444", // red
  "#a855f7", // purple
  "#06b6d4", // cyan
  "#ec4899", // pink
  "#84cc16", // lime
];

function hashSeed(seed) {
  let h = 0;
  const s = String(seed || "");
  for (let i = 0; i < s.length; i += 1) {
    h = (h << 5) - h + s.charCodeAt(i);
    h |= 0;
  }
  return Math.abs(h);
}

function initialsFor(name) {
  if (!name) return "?";
  const parts = String(name).trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

export function Avatar({
  name,
  email,
  size = "md",
  title,
  className = "",
  ...rest
}) {
  const seed = email || name || "anon";
  const color = PALETTE[hashSeed(seed) % PALETTE.length];
  const initials = initialsFor(name || email);

  return (
    <span
      className={`${styles.avatar} ${styles[`size-${size}`]} ${className}`.trim()}
      style={{ backgroundColor: color }}
      title={title || name || email}
      role="img"
      aria-label={name || email || "User"}
      {...rest}
    >
      {initials}
    </span>
  );
}

/**
 * AvatarStack — overlapping avatars with a "+N" overflow chip.
 * `users` is an array of {name, email}. `max` is the number to show.
 */
export function AvatarStack({ users = [], max = 3, size = "md" }) {
  const visible = users.slice(0, max);
  const overflow = Math.max(0, users.length - visible.length);

  return (
    <div className={`${styles.stack} ${styles[`stack-size-${size}`]}`}>
      {visible.map((u, i) => (
        <Avatar
          key={u.email || u.name || i}
          name={u.name}
          email={u.email}
          size={size}
          className={styles.stackItem}
        />
      ))}
      {overflow > 0 && (
        <span
          className={`${styles.avatar} ${styles[`size-${size}`]} ${styles.overflow} ${styles.stackItem}`}
          title={`${overflow} more`}
        >
          +{overflow}
        </span>
      )}
    </div>
  );
}

export default Avatar;
