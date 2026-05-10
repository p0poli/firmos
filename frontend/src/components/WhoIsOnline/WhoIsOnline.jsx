/**
 * WhoIsOnline — live presence card.
 *
 * Calls GET /sessions/online on mount and then every 60 seconds.
 * Shows each online user with:
 *   - Green-dot avatar
 *   - Name + role badge
 *   - In-Revit indicator (orange dot + file name) or "On platform"
 *   - Active project
 *   - Time online (duration since login_time)
 */
import React, { useEffect, useRef, useState } from "react";
import { Monitor } from "lucide-react";
import { Avatar, Badge, EmptyState, SkeletonGroup } from "../ui";
import { getOnlineUsers } from "../../api";
import { relativeTime } from "../../lib/dates";
import styles from "./WhoIsOnline.module.css";

const ROLE_LABELS = {
  admin: "Admin",
  project_manager: "PM",
  architect: "Architect",
};

const ROLE_VARIANT = {
  admin: "danger",
  project_manager: "warning",
  architect: "primary",
};

function formatDuration(loginTime) {
  const diffMs = Date.now() - new Date(loginTime).getTime();
  if (diffMs < 0) return "just now";
  const totalMinutes = Math.floor(diffMs / 60000);
  if (totalMinutes < 1) return "just now";
  const h = Math.floor(totalMinutes / 60);
  const m = totalMinutes % 60;
  if (h === 0) return `${m}m`;
  if (m === 0) return `${h}h`;
  return `${h}h ${m}m`;
}

export function WhoIsOnline() {
  const [users, setUsers] = useState(null);
  const intervalRef = useRef(null);

  const fetch = () => {
    getOnlineUsers()
      .then(setUsers)
      .catch(() => setUsers([]));
  };

  useEffect(() => {
    fetch();
    intervalRef.current = setInterval(fetch, 60 * 1000); // refresh every 60 s
    return () => clearInterval(intervalRef.current);
  }, []);

  if (users === null) return <SkeletonGroup count={3} />;

  if (users.length === 0) {
    return (
      <EmptyState
        icon={Monitor}
        title="No one else is online right now"
        description="Active sessions will appear here within 20 minutes of login."
        size="sm"
      />
    );
  }

  return (
    <ul className={styles.list}>
      {users.map((u) => {
        const fileName = u.last_revit_file
          ? u.last_revit_file.length > 20
            ? u.last_revit_file.slice(0, 19) + "…"
            : u.last_revit_file
          : null;

        return (
          <li key={u.user_id} className={styles.row}>
            {/* Avatar with green presence dot */}
            <div className={styles.avatarWrap}>
              <Avatar name={u.user_name} size="md" />
              <span className={styles.presenceDot} aria-label="Online" />
            </div>

            {/* Main content */}
            <div className={styles.body}>
              <div className={styles.nameRow}>
                <span className={styles.name}>{u.user_name}</span>
                <Badge
                  variant={ROLE_VARIANT[u.role] ?? "neutral"}
                  size="sm"
                >
                  {ROLE_LABELS[u.role] ?? u.role}
                </Badge>
              </div>

              <div className={styles.meta}>
                {/* Revit indicator */}
                {u.in_revit ? (
                  <span className={styles.revitBadge}>
                    <span className={styles.revitDot} aria-hidden="true" />
                    In Revit
                    {fileName && (
                      <span className={styles.revitFile}>{fileName}</span>
                    )}
                  </span>
                ) : (
                  <span className={styles.platform}>On platform</span>
                )}

                <span className={styles.sep}>·</span>

                {/* Active project */}
                <span className={styles.project}>
                  {u.active_project_name ?? "No project selected"}
                </span>
              </div>
            </div>

            {/* Time online */}
            <span className={styles.duration} title={`Logged in ${relativeTime(u.login_time)}`}>
              {formatDuration(u.login_time)}
            </span>
          </li>
        );
      })}
    </ul>
  );
}

export default WhoIsOnline;
