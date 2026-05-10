/**
 * Management — admin + project_manager only.
 *
 * Sections:
 *   1. Team Utilization  — GET /management/team-utilization?period={period}
 *   2. Activity Log      — GET /management/activity-log?limit=50
 *   3. Project Health    — GET /management/project-health
 *
 * Period selector (This week / This month) controls Section 1.
 */
import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  Activity,
  CheckCircle2,
  ChevronDown,
  LogIn,
  LogOut,
  Monitor,
  MonitorOff,
  RefreshCw,
  Users,
} from "lucide-react";
import {
  Avatar,
  AvatarStack,
  Badge,
  Card,
  CardHeader,
  EmptyState,
  ProgressBar,
  SkeletonGroup,
} from "../../components/ui";
import { useUser } from "../../contexts/UserContext";
import {
  getActivityLog,
  getProjectHealth,
  getProjectTasks,
  getTeamUtilization,
} from "../../api";
import { daysFromToday, deadlinePhrase, relativeTime, shortDate } from "../../lib/dates";
import styles from "./Management.module.css";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const ROLE_LABELS = { admin: "Admin", project_manager: "PM", architect: "Architect" };
const ROLE_VARIANT = { admin: "danger", project_manager: "warning", architect: "primary" };

const STATUS_VARIANT = {
  active: "primary",
  "on-hold": "warning",
  completed: "success",
  archived: "neutral",
};

const LOG_TYPE_META = {
  login:        { Icon: LogIn,      color: "var(--color-success)",  label: "Login"     },
  logout:       { Icon: LogOut,     color: "var(--color-text-muted)", label: "Logout"  },
  revit_open:   { Icon: Monitor,    color: "var(--color-primary)",  label: "Revit open"  },
  revit_close:  { Icon: MonitorOff, color: "var(--color-text-muted)", label: "Revit close" },
  revit_sync:   { Icon: RefreshCw,  color: "#6366f1",               label: "Revit sync"  },
  task_complete:{ Icon: CheckCircle2,color: "var(--color-success)", label: "Task done"  },
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function hoursBar(hours, maxHours) {
  const pct = maxHours > 0 ? Math.min((hours / maxHours) * 100, 100) : 0;
  const color =
    hours >= 30 ? "var(--color-success)"
    : hours >= 15 ? "var(--color-warning)"
    : "var(--color-danger)";
  return { pct, color };
}

function groupByDate(items) {
  const groups = {};
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);

  for (const item of items) {
    const d = new Date(item.timestamp);
    d.setHours(0, 0, 0, 0);
    let label;
    if (d.getTime() === today.getTime()) label = "Today";
    else if (d.getTime() === yesterday.getTime()) label = "Yesterday";
    else label = shortDate(item.timestamp);

    if (!groups[label]) groups[label] = [];
    groups[label].push(item);
  }
  return Object.entries(groups);
}

function fmtTime(ts) {
  return new Date(ts).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export default function Management() {
  const navigate = useNavigate();
  const { isAdmin, isProjectManager } = useUser();

  // Redirect if not authorized
  useEffect(() => {
    if (!isAdmin && !isProjectManager) navigate("/", { replace: true });
  }, [isAdmin, isProjectManager, navigate]);

  const [period, setPeriod] = useState("week");

  // Section 1 state
  const [utilization, setUtilization] = useState(null);
  const [utilLoading, setUtilLoading] = useState(true);

  // Section 2 state
  const [logItems, setLogItems]       = useState(null);
  const [logCursor, setLogCursor]     = useState(null);
  const [logLoadMore, setLogLoadMore] = useState(false);

  // Section 3 state
  const [projectHealth, setProjectHealth]     = useState(null);
  const [tasksByProject, setTasksByProject]   = useState({});

  // ---- Fetch team utilization (re-fetches when period changes) ----
  useEffect(() => {
    let cancelled = false;
    setUtilLoading(true);
    setUtilization(null);
    getTeamUtilization(period)
      .then((d) => { if (!cancelled) { setUtilization(d); setUtilLoading(false); } })
      .catch(() => { if (!cancelled) { setUtilization([]); setUtilLoading(false); } });
    return () => { cancelled = true; };
  }, [period]);

  // ---- Fetch activity log (once) ----
  useEffect(() => {
    let cancelled = false;
    getActivityLog(50)
      .then((d) => {
        if (cancelled) return;
        setLogItems(d.items);
        setLogCursor(d.next_cursor ?? null);
      })
      .catch(() => { if (!cancelled) setLogItems([]); });
    return () => { cancelled = true; };
  }, []);

  // ---- Fetch project health + tasks ----
  useEffect(() => {
    let cancelled = false;
    getProjectHealth()
      .then((data) => {
        if (cancelled) return;
        setProjectHealth(data);
        // Fetch tasks for each project for more accurate progress (health endpoint already has it)
        // The health endpoint returns tasks_total/tasks_done; no extra fetch needed.
      })
      .catch(() => { if (!cancelled) setProjectHealth([]); });
    return () => { cancelled = true; };
  }, []);

  const loadMore = useCallback(() => {
    if (!logCursor) return;
    setLogLoadMore(true);
    getActivityLog(50, logCursor)
      .then((d) => {
        setLogItems((prev) => [...(prev ?? []), ...d.items]);
        setLogCursor(d.next_cursor ?? null);
      })
      .catch(() => {})
      .finally(() => setLogLoadMore(false));
  }, [logCursor]);

  const maxHours = useMemo(
    () => Math.max(...(utilization ?? []).map((u) => u.total_hours), 1),
    [utilization]
  );

  const logGroups = useMemo(
    () => (logItems ? groupByDate(logItems) : []),
    [logItems]
  );

  return (
    <div className={styles.page}>
      {/* ---- Header ---- */}
      <header className={styles.header}>
        <h1 className={styles.title}>Management</h1>
        <div className={styles.periodPills}>
          {["week", "month"].map((p) => (
            <button
              key={p}
              type="button"
              className={`${styles.pill} ${period === p ? styles.pillActive : ""}`}
              onClick={() => setPeriod(p)}
            >
              {p === "week" ? "This week" : "This month"}
            </button>
          ))}
        </div>
      </header>

      {/* ================================================================ */}
      {/* SECTION 1 — Team Utilization                                     */}
      {/* ================================================================ */}
      <section className={styles.section}>
        <Card padding="md">
          <CardHeader
            title="Team utilization"
            subtitle={`Hours logged per team member · ${period === "week" ? "last 7 days" : "last 30 days"}`}
          />
          {utilLoading || utilization === null ? (
            <SkeletonGroup count={4} />
          ) : utilization.length === 0 ? (
            <EmptyState
              icon={Users}
              title="No data yet"
              description="Session data will appear here as team members log in."
              size="sm"
            />
          ) : (
            <div className={styles.utilTable}>
              {utilization.map((member) => {
                const { pct, color } = hoursBar(member.total_hours, maxHours);
                return (
                  <div key={member.user_id} className={styles.utilRow}>
                    {/* Avatar + name + role */}
                    <div className={styles.utilUser}>
                      <Avatar name={member.user_name} size="md" />
                      <div className={styles.utilUserMeta}>
                        <span className={styles.utilName}>{member.user_name}</span>
                        <Badge
                          variant={ROLE_VARIANT[member.role] ?? "neutral"}
                          size="sm"
                        >
                          {ROLE_LABELS[member.role] ?? member.role}
                        </Badge>
                      </div>
                    </div>

                    {/* Hours bar */}
                    <div className={styles.utilBar}>
                      <div className={styles.utilBarTrack}>
                        <div
                          className={styles.utilBarFill}
                          style={{ width: `${pct}%`, background: color }}
                        />
                      </div>
                      <span className={styles.utilHours}>
                        {member.total_hours.toFixed(1)}h
                      </span>
                    </div>

                    {/* Per-project pills */}
                    <div className={styles.utilProjects}>
                      {member.hours_per_project.length > 0 ? (
                        member.hours_per_project.map((ph) => (
                          <span key={ph.project_id} className={styles.projectPill}>
                            {ph.project_name}: {ph.hours}h
                          </span>
                        ))
                      ) : (
                        <span className={styles.utilMuted}>No project time tracked</span>
                      )}
                    </div>

                    {/* Revit events + tasks */}
                    <div className={styles.utilStats}>
                      <span className={styles.utilStat} title="Revit events">
                        <Activity size={13} strokeWidth={2} />
                        {member.revit_events_count}
                      </span>
                      <span className={styles.utilStat} title="Tasks completed">
                        <CheckCircle2 size={13} strokeWidth={2} />
                        {member.tasks_completed}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </Card>
      </section>

      {/* ================================================================ */}
      {/* SECTION 2 — Activity Log                                         */}
      {/* ================================================================ */}
      <section className={styles.section}>
        <Card padding="md">
          <CardHeader
            title="Activity log"
            subtitle="Sessions and Revit events across the firm"
          />
          {logItems === null ? (
            <SkeletonGroup count={6} />
          ) : logItems.length === 0 ? (
            <EmptyState
              icon={Activity}
              title="No activity yet"
              description="Login events and Revit model events will appear here."
              size="sm"
            />
          ) : (
            <>
              {logGroups.map(([dateLabel, events]) => (
                <div key={dateLabel} className={styles.logGroup}>
                  <div className={styles.logDateLabel}>{dateLabel}</div>
                  <ul className={styles.logList}>
                    {events.map((item, idx) => {
                      const meta = LOG_TYPE_META[item.type] ?? LOG_TYPE_META.revit_sync;
                      const { Icon } = meta;
                      return (
                        <li key={idx} className={styles.logRow}>
                          <span className={styles.logTime}>{fmtTime(item.timestamp)}</span>
                          <span
                            className={styles.logIcon}
                            style={{ color: meta.color }}
                            aria-label={meta.label}
                          >
                            <Icon size={14} strokeWidth={2} />
                          </span>
                          <Avatar name={item.user_name} size="sm" />
                          <div className={styles.logBody}>
                            <span className={styles.logDesc}>{item.description}</span>
                            {item.project_name && (
                              <span className={styles.logProject}>
                                {item.project_name}
                              </span>
                            )}
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              ))}

              {logCursor && (
                <div className={styles.loadMoreWrap}>
                  <button
                    type="button"
                    className={styles.loadMoreBtn}
                    onClick={loadMore}
                    disabled={logLoadMore}
                  >
                    {logLoadMore ? "Loading…" : "Load more"}
                    {!logLoadMore && <ChevronDown size={14} style={{ marginLeft: 4 }} />}
                  </button>
                </div>
              )}
            </>
          )}
        </Card>
      </section>

      {/* ================================================================ */}
      {/* SECTION 3 — Project Health                                       */}
      {/* ================================================================ */}
      <section className={styles.section}>
        <Card padding="md">
          <CardHeader
            title="Project health"
            subtitle="Active projects — task progress, deadline, and Revit activity"
          />
          {projectHealth === null ? (
            <SkeletonGroup count={4} />
          ) : projectHealth.length === 0 ? (
            <EmptyState
              icon={Monitor}
              title="No active projects"
              description="Projects set to active status will appear here."
              size="sm"
            />
          ) : (
            <ul className={styles.healthList}>
              {projectHealth.map((p) => {
                const days = p.deadline ? daysFromToday(p.deadline) : null;
                const overdue = days !== null && days < 0;
                const urgent  = days !== null && days >= 0 && days < 7;
                const pct = p.tasks_total > 0
                  ? Math.round((p.tasks_done / p.tasks_total) * 100)
                  : 0;
                return (
                  <li
                    key={p.project_id}
                    className={styles.healthRow}
                    style={{ cursor: "pointer" }}
                    onClick={() => navigate(`/project/${p.project_id}`)}
                  >
                    {/* Project name + status */}
                    <div className={styles.healthName}>
                      <span className={styles.healthTitle}>{p.project_name}</span>
                      <Badge variant={STATUS_VARIANT[p.status] ?? "neutral"} size="sm">
                        {p.status}
                      </Badge>
                    </div>

                    {/* Progress */}
                    <div className={styles.healthProgress}>
                      <ProgressBar
                        value={p.tasks_done}
                        max={Math.max(p.tasks_total, 1)}
                        intent={
                          p.tasks_total > 0 && p.tasks_done === p.tasks_total
                            ? "success"
                            : "primary"
                        }
                        showLabel
                        label={`${p.tasks_done}/${p.tasks_total} tasks`}
                      />
                    </div>

                    {/* Deadline */}
                    <span
                      className={
                        overdue
                          ? styles.deadlineOverdue
                          : urgent
                          ? styles.deadlineUrgent
                          : styles.deadline
                      }
                    >
                      {p.deadline ? deadlinePhrase(p.deadline) : "No deadline"}
                    </span>

                    {/* Overdue tasks badge */}
                    {p.overdue_tasks > 0 && (
                      <Badge variant="danger" size="sm">
                        {p.overdue_tasks} overdue
                      </Badge>
                    )}

                    {/* Last Revit activity */}
                    <span className={styles.healthRevit}>
                      {p.last_revit_activity
                        ? relativeTime(p.last_revit_activity)
                        : "No Revit activity"}
                    </span>
                  </li>
                );
              })}
            </ul>
          )}
        </Card>
      </section>
    </div>
  );
}
