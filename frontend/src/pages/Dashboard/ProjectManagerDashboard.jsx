/**
 * ProjectManagerDashboard — focused on the PM's own projects.
 *
 * Sections:
 *   1. Bottleneck alerts (if any delay_risk / bottleneck insights exist)
 *   2. My projects    — active projects visible to this user + progress
 *   3. Tasks due soon — tasks across those projects assigned to me
 *   4. Revit Checks   — gated by revit_connect module (LockedModule if off)
 */
import React, { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  AlertOctagon,
  AlertTriangle,
  CheckCircle2,
  Inbox,
  Sparkles,
  XCircle,
} from "lucide-react";
import {
  AvatarStack,
  Badge,
  Card,
  CardHeader,
  EmptyState,
  ProgressBar,
  Skeleton,
  SkeletonGroup,
  StatCard,
} from "../../components/ui";
import { LockedModule } from "../../components/LockedModule";
import { useUser } from "../../contexts/UserContext";
import {
  getProjectInsights,
  getProjectTasks,
  getRecentChecks,
  listProjects,
} from "../../api";
import {
  daysFromToday,
  deadlinePhrase,
  relativeTime,
  shortDate,
} from "../../lib/dates";
import styles from "./Dashboard.module.css";

const STATUS_TO_VARIANT = {
  active: "primary",
  "on-hold": "warning",
  completed: "success",
  archived: "neutral",
};

const PRIORITY_TO_VARIANT = {
  high: "danger",
  medium: "warning",
  low: "neutral",
};

const CHECK_ICON = {
  pass: CheckCircle2,
  fail: XCircle,
  warning: AlertTriangle,
};

const CHECK_INTENT = {
  pass: "success",
  fail: "danger",
  warning: "warning",
};

const HORIZON_DAYS = 7;

function variantColor(variant) {
  switch (variant) {
    case "primary": return "var(--color-primary)";
    case "success": return "var(--color-success)";
    case "warning": return "var(--color-warning)";
    case "danger":  return "var(--color-danger)";
    default:        return "var(--color-text-muted)";
  }
}

export default function ProjectManagerDashboard() {
  const navigate = useNavigate();
  const { user, hasModule } = useUser();
  const revitActive = hasModule("revit_connect");

  const [projects, setProjects] = useState(null);
  const [tasksByProject, setTasksByProject] = useState(null);
  const [bottlenecks, setBottlenecks] = useState([]);
  const [recentChecks, setRecentChecks] = useState(null);
  const [error, setError] = useState(null);

  // Load projects + (if revit active) recent checks
  useEffect(() => {
    let cancelled = false;
    const calls = [listProjects("active")];
    if (revitActive) calls.push(getRecentChecks(8));

    Promise.allSettled(calls).then(([projR, checkR]) => {
      if (cancelled) return;
      if (projR.status === "fulfilled") setProjects(projR.value);
      else setError("Could not load projects.");
      if (checkR) {
        setRecentChecks(checkR.status === "fulfilled" ? checkR.value : []);
      } else {
        setRecentChecks([]);
      }
    });
    return () => { cancelled = true; };
  }, [revitActive]);

  // Load tasks + insights for each project
  useEffect(() => {
    if (!projects) return;
    let cancelled = false;
    if (projects.length === 0) { setTasksByProject({}); return; }

    Promise.all(
      projects.map((p) =>
        Promise.allSettled([
          getProjectTasks(p.id),
          getProjectInsights(p.id),
        ]).then(([taskR, insR]) => ({
          id: p.id,
          tasks: taskR.status === "fulfilled" ? taskR.value : [],
          insights: insR.status === "fulfilled" ? insR.value : [],
        }))
      )
    ).then((results) => {
      if (cancelled) return;
      const taskMap = {};
      const alerts = [];
      for (const r of results) {
        taskMap[r.id] = r.tasks;
        for (const ins of r.insights) {
          if (ins.type === "delay_risk" || ins.type === "bottleneck") {
            alerts.push({ ...ins, project_id: r.id });
          }
        }
      }
      setTasksByProject(taskMap);
      // Keep only the 3 most recent bottleneck/risk insights
      setBottlenecks(
        alerts
          .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))
          .slice(0, 3)
      );
    });
    return () => { cancelled = true; };
  }, [projects]);

  // Tasks past due date and not completed (across all loaded projects)
  const overdueTasksCount = useMemo(() => {
    if (!tasksByProject) return null;
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    let count = 0;
    for (const tasks of Object.values(tasksByProject)) {
      for (const t of tasks) {
        if (t.status === "done") continue;
        if (!t.due_date) continue;
        if (new Date(t.due_date) < today) count++;
      }
    }
    return count;
  }, [tasksByProject]);

  // Tasks assigned to this user, due within HORIZON_DAYS
  const projectsById = useMemo(() => {
    if (!projects) return {};
    return Object.fromEntries(projects.map((p) => [p.id, p]));
  }, [projects]);

  const myTasksDueSoon = useMemo(() => {
    if (!user || tasksByProject === null) return null;
    const result = [];
    for (const [projectId, tasks] of Object.entries(tasksByProject)) {
      for (const t of tasks) {
        if (t.assigned_user_id !== user.id) continue;
        if (!t.due_date) continue;
        const days = daysFromToday(t.due_date);
        if (days === null || days > HORIZON_DAYS) continue;
        result.push({ ...t, project: projectsById[projectId] });
      }
    }
    return result.sort((a, b) => {
      const da = daysFromToday(a.due_date);
      const db = daysFromToday(b.due_date);
      return (da ?? 0) - (db ?? 0);
    });
  }, [user, tasksByProject, projectsById]);

  return (
    <div className={styles.page}>
      {error && (
        <Card className={styles.errorCard}>
          <strong>Couldn't load projects.</strong>{" "}
          <span style={{ color: "var(--color-text-secondary)" }}>{error}</span>
        </Card>
      )}

      {/* --- Stat row --------------------------------------------------- */}
      <div className={styles.statsRow}>
        <StatCard
          label="Active projects"
          value={projects === null ? "—" : projects.length}
          tooltip="Your active projects across the firm"
          onClick={() => navigate("/portfolio?status=active")}
        />
        <StatCard
          label="Due this week"
          value={myTasksDueSoon === null ? "—" : myTasksDueSoon.length}
          tooltip={`Tasks assigned to you due in the next ${HORIZON_DAYS} days`}
          onClick={() => navigate("/tasks")}
        />
        <StatCard
          label="Tasks overdue"
          value={overdueTasksCount === null ? "—" : overdueTasksCount}
          tooltip="Tasks past their due date that are not yet completed"
          trendIntent={overdueTasksCount > 0 ? "negative" : "neutral"}
          onClick={() => navigate("/tasks?filter=overdue")}
        />
        <StatCard
          label="Risk alerts"
          value={bottlenecks === null ? "—" : bottlenecks.length}
          tooltip="Delay risks and bottlenecks detected across your projects"
          trendIntent={bottlenecks.length > 0 ? "negative" : "neutral"}
          onClick={() => navigate("/portfolio")}
        />
      </div>

      {/* --- Bottleneck alerts ------------------------------------------ */}
      {bottlenecks.length > 0 && (
        <section className={styles.section}>
          <header className={styles.sectionHeader}>
            <h2 className={styles.sectionTitle}>Alerts</h2>
          </header>
          <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-2)" }}>
            {bottlenecks.map((b) => (
              <div key={b.id} className={styles.bottleneckAlert}>
                <span className={styles.bottleneckAlertIcon}>
                  {b.type === "bottleneck" ? (
                    <AlertOctagon size={16} strokeWidth={2} />
                  ) : (
                    <AlertTriangle size={16} strokeWidth={2} />
                  )}
                </span>
                <span className={styles.bottleneckAlertText}>
                  <strong>{projectsById[b.project_id]?.name ?? "Project"}</strong>
                  {" — "}
                  {b.content}
                </span>
                <span style={{ fontSize: "var(--text-xs)", color: "var(--color-text-muted)", whiteSpace: "nowrap" }}>
                  {relativeTime(b.timestamp)}
                </span>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* --- My projects ------------------------------------------------- */}
      <section className={styles.section}>
        <header className={styles.sectionHeader}>
          <h2 className={styles.sectionTitle}>Active projects</h2>
          {projects && (
            <span className={styles.sectionMeta}>
              {projects.length} {projects.length === 1 ? "project" : "projects"}
            </span>
          )}
        </header>
        <ActiveProjectsRow projects={projects} tasksByProject={tasksByProject} />
      </section>

      {/* --- Due soon + Revit checks ------------------------------------- */}
      <section className={styles.row2}>
        <Card padding="md">
          <CardHeader
            title="Due soon"
            subtitle={`Your tasks in the next ${HORIZON_DAYS} days`}
          />
          <DueSoonBody items={myTasksDueSoon} />
        </Card>

        {revitActive ? (
          <Card padding="md">
            <CardHeader
              title="Recent checks"
              subtitle="Latest compliance results from Revit"
            />
            <RecentChecksBody items={recentChecks} />
          </Card>
        ) : (
          <LockedModule
            title="Revit Connect"
            description="Contact your admin to activate Revit Connect and unlock compliance checks."
          >
            <Card padding="md">
              <CardHeader
                title="Recent checks"
                subtitle="Latest compliance results from Revit"
              />
              <SkeletonGroup count={3} />
            </Card>
          </LockedModule>
        )}
      </section>
    </div>
  );
}

// --- subcomponents ---------------------------------------------------------

function ActiveProjectsRow({ projects, tasksByProject }) {
  const navigate = useNavigate();
  if (projects === null) {
    return (
      <div className={styles.projectScroll}>
        {[0, 1, 2].map((i) => (
          <div key={i} className={styles.projectCardSkeleton}>
            <Skeleton width="60%" height={20} />
            <Skeleton width="40%" height={14} />
            <Skeleton width="100%" height={4} />
          </div>
        ))}
      </div>
    );
  }
  if (projects.length === 0) {
    return (
      <Card padding="none">
        <EmptyState
          icon={Sparkles}
          title="No active projects"
          description="Projects you manage will appear here once they're set to active."
          size="md"
        />
      </Card>
    );
  }
  return (
    <div className={styles.projectScroll}>
      {projects.map((p) => {
        const tasks = tasksByProject?.[p.id];
        const tasksLoaded = Array.isArray(tasks);
        const total = tasksLoaded ? tasks.length : 0;
        const done = tasksLoaded ? tasks.filter((t) => t.status === "done").length : 0;
        const days = daysFromToday(p.deadline);
        const urgent = days !== null && days >= 0 && days < 7;
        const overdue = days !== null && days < 0;
        return (
          <Card
            key={p.id}
            interactive
            className={styles.projectCard}
            onClick={() => navigate(`/project/${p.id}`)}
          >
            <header className={styles.projectCardHeader}>
              <h3 className={styles.projectCardTitle} title={p.name}>
                {p.name}
              </h3>
              <Badge
                variant={STATUS_TO_VARIANT[p.status] ?? "neutral"}
                size="sm"
              >
                {p.status}
              </Badge>
            </header>
            {tasksLoaded ? (
              <ProgressBar
                value={done}
                max={Math.max(total, 1)}
                intent={total > 0 && done === total ? "success" : "primary"}
                showLabel
                label={`${done} of ${total} tasks`}
              />
            ) : (
              <Skeleton width="100%" height={4} />
            )}
            <div className={styles.projectCardFooter}>
              <span
                className={
                  overdue
                    ? styles.deadlineOverdue
                    : urgent
                    ? styles.deadlineUrgent
                    : styles.deadline
                }
              >
                {p.deadline ? (
                  <>
                    <span className={styles.deadlineDate}>{shortDate(p.deadline)}</span>
                    <span className={styles.deadlineRel}>{deadlinePhrase(p.deadline)}</span>
                  </>
                ) : (
                  <span className={styles.deadlineRel}>No deadline</span>
                )}
              </span>
              <AvatarStack users={p.members ?? []} max={3} size="sm" />
            </div>
          </Card>
        );
      })}
    </div>
  );
}

function DueSoonBody({ items }) {
  if (items === null) return <SkeletonGroup count={4} />;
  if (items.length === 0) {
    return (
      <EmptyState
        icon={Inbox}
        title="You're all caught up"
        description="No tasks assigned to you are due in the next week."
        size="sm"
      />
    );
  }
  return (
    <ul className={styles.taskList}>
      {items.map((t) => {
        const days = daysFromToday(t.due_date);
        const isOverdue = days !== null && days < 0;
        return (
          <li key={t.id} className={styles.taskRow}>
            <span
              className={styles.projectDot}
              style={{
                backgroundColor: variantColor(
                  STATUS_TO_VARIANT[t.project?.status] ?? "neutral"
                ),
              }}
              aria-hidden="true"
            />
            <div className={styles.taskBody}>
              <span className={styles.taskTitle}>{t.title}</span>
              <span className={styles.taskMeta}>
                {t.project?.name ?? "—"}
                <span className={styles.dotSep}>·</span>
                <span className={isOverdue ? styles.overdue : ""}>
                  {deadlinePhrase(t.due_date)}
                </span>
              </span>
            </div>
            <Badge
              variant={PRIORITY_TO_VARIANT[t.priority] ?? "neutral"}
              size="sm"
            >
              {t.priority}
            </Badge>
          </li>
        );
      })}
    </ul>
  );
}

function RecentChecksBody({ items }) {
  if (items === null) return <SkeletonGroup count={3} />;
  if (items.length === 0) {
    return (
      <EmptyState
        icon={CheckCircle2}
        title="No checks yet"
        description="Compliance check results from Revit will appear here."
        size="sm"
      />
    );
  }
  return (
    <ul className={styles.checkList}>
      {items.map((c) => {
        const Icon = CHECK_ICON[c.status] ?? CheckCircle2;
        const intent = CHECK_INTENT[c.status] ?? "neutral";
        const issuesCount = c.issues?.length ?? 0;
        return (
          <li key={c.id} className={styles.checkRow}>
            <span
              className={`${styles.checkIcon} ${styles[`intent-${intent}`]}`}
              aria-hidden="true"
            >
              <Icon size={16} strokeWidth={2} />
            </span>
            <div className={styles.checkBody}>
              <span className={styles.checkType}>
                {c.check_type.replace(/_/g, " ")}
              </span>
              <span className={styles.checkMeta}>
                {issuesCount > 0
                  ? `${issuesCount} ${issuesCount === 1 ? "issue" : "issues"}`
                  : "no issues"}
                <span className={styles.dotSep}>·</span>
                {relativeTime(c.timestamp)}
              </span>
            </div>
            <Badge variant={intent} size="sm">
              {c.status}
            </Badge>
          </li>
        );
      })}
    </ul>
  );
}
