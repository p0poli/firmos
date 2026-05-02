/**
 * Dashboard — the priority page of the redesign.
 *
 * Three sections:
 *   1. My Work       (left: tasks due in 7 days, right: AI insights)
 *   2. Active Projects (horizontal scroll of project cards)
 *   3. Team Activity (left: who's online, right: recent checks)
 *
 * Data fetching strategy: one parallel batch for the things that don't
 * depend on each other (`/users/me`, `/projects/`, `/insights/recent`,
 * `/sessions/active`, `/revit/checks/recent`), then a second parallel
 * batch for per-project tasks (one request per project, all in flight at
 * once via Promise.all). Each section renders its own skeleton while
 * its inputs aren't ready and its own empty/error state otherwise.
 */
import React, { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  AlertOctagon,
  AlertTriangle,
  CheckCircle2,
  Inbox,
  Lightbulb,
  Sparkles,
  XCircle,
} from "lucide-react";
import {
  Avatar,
  AvatarStack,
  Badge,
  Card,
  CardHeader,
  EmptyState,
  ProgressBar,
  Skeleton,
  SkeletonGroup,
} from "../components/ui";
import {
  getActiveSessions,
  getMe,
  getProjectTasks,
  getRecentChecks,
  getRecentInsights,
  listProjects,
} from "../api";
import {
  daysFromToday,
  deadlinePhrase,
  relativeTime,
  shortDate,
} from "../lib/dates";
import styles from "./Dashboard.module.css";

// --- mappings --------------------------------------------------------------

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

const INSIGHT_ICON = {
  delay_risk: AlertTriangle,
  bottleneck: AlertOctagon,
  progress_summary: Lightbulb,
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

// Map a Badge variant token to a raw CSS color for the inline project dot
// in the Due Soon list. Mirrors the Badge primitive's variant palette.
function variantColor(variant) {
  switch (variant) {
    case "primary":
      return "var(--color-primary)";
    case "success":
      return "var(--color-success)";
    case "warning":
      return "var(--color-warning)";
    case "danger":
      return "var(--color-danger)";
    case "neutral":
    default:
      return "var(--color-text-muted)";
  }
}

// --- page ------------------------------------------------------------------

export default function Dashboard() {
  const [me, setMe] = useState(null);
  const [projects, setProjects] = useState(null);
  const [tasksByProject, setTasksByProject] = useState(null);
  const [insights, setInsights] = useState(null);
  const [activeSessions, setActiveSessions] = useState(null);
  const [recentChecks, setRecentChecks] = useState(null);
  const [error, setError] = useState(null);

  // First batch: everything that doesn't depend on the project list.
  useEffect(() => {
    let cancelled = false;
    Promise.allSettled([
      getMe(),
      listProjects(),
      getRecentInsights(5),
      getActiveSessions(),
      getRecentChecks(8),
    ]).then((results) => {
      if (cancelled) return;
      const [meR, projR, insR, sessR, checkR] = results;
      if (meR.status === "fulfilled") setMe(meR.value);
      if (projR.status === "fulfilled") setProjects(projR.value);
      else setError("Could not load projects.");
      setInsights(insR.status === "fulfilled" ? insR.value : []);
      setActiveSessions(sessR.status === "fulfilled" ? sessR.value : []);
      setRecentChecks(checkR.status === "fulfilled" ? checkR.value : []);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  // Second batch: per-project tasks. Fired only after projects load.
  useEffect(() => {
    if (!projects) return;
    let cancelled = false;
    if (projects.length === 0) {
      setTasksByProject({});
      return;
    }
    Promise.all(
      projects.map((p) =>
        getProjectTasks(p.id)
          .then((tasks) => [p.id, tasks])
          .catch(() => [p.id, []])
      )
    ).then((entries) => {
      if (cancelled) return;
      setTasksByProject(Object.fromEntries(entries));
    });
    return () => {
      cancelled = true;
    };
  }, [projects]);

  // Project-name lookup for cross-references (insights, due-soon rows).
  const projectsById = useMemo(() => {
    if (!projects) return {};
    return Object.fromEntries(projects.map((p) => [p.id, p]));
  }, [projects]);

  // "My tasks due in the next 7 days", flat-mapped across all projects.
  // null = still loading; [] = loaded with nothing to show.
  const myTasksDueSoon = useMemo(() => {
    if (!me || tasksByProject === null) return null;
    const result = [];
    for (const [projectId, tasks] of Object.entries(tasksByProject)) {
      for (const t of tasks) {
        if (t.assigned_user_id !== me.id) continue;
        if (!t.due_date) continue;
        const days = daysFromToday(t.due_date);
        if (days === null || days > HORIZON_DAYS) continue;
        // Overdue tasks are kept — they're the most urgent thing to surface.
        result.push({ ...t, project: projectsById[projectId] });
      }
    }
    return result.sort((a, b) => {
      const da = daysFromToday(a.due_date);
      const db = daysFromToday(b.due_date);
      return (da ?? 0) - (db ?? 0);
    });
  }, [me, tasksByProject, projectsById]);

  // Active projects only — the cards in the horizontal scroller.
  const activeProjects = useMemo(() => {
    if (!projects) return null;
    return projects.filter((p) => p.status === "active");
  }, [projects]);

  return (
    <div className={styles.page}>
      {error && (
        <Card className={styles.errorCard}>
          <strong>Couldn't fully load the dashboard.</strong>{" "}
          <span style={{ color: "var(--color-text-secondary)" }}>{error}</span>
        </Card>
      )}

      {/* --- Section 1: My Work ------------------------------------------ */}
      <section className={styles.row2}>
        <Card padding="md">
          <CardHeader
            title="Due soon"
            subtitle={`Tasks assigned to you in the next ${HORIZON_DAYS} days`}
          />
          <DueSoonBody items={myTasksDueSoon} />
        </Card>

        <Card padding="md">
          <CardHeader
            title="AI insights"
            subtitle="Latest signals across your projects"
          />
          <InsightsBody items={insights} projectsById={projectsById} />
        </Card>
      </section>

      {/* --- Section 2: Active Projects ---------------------------------- */}
      <section className={styles.section}>
        <header className={styles.sectionHeader}>
          <h2 className={styles.sectionTitle}>Active projects</h2>
          {activeProjects && activeProjects.length > 0 && (
            <span className={styles.sectionMeta}>
              {activeProjects.length}{" "}
              {activeProjects.length === 1 ? "project" : "projects"}
            </span>
          )}
        </header>
        <ActiveProjectsRow
          projects={activeProjects}
          tasksByProject={tasksByProject}
        />
      </section>

      {/* --- Section 3: Team Activity ------------------------------------ */}
      <section className={styles.row2}>
        <Card padding="md">
          <CardHeader
            title="Who's online"
            subtitle="Active sessions across the firm"
          />
          <ActiveSessionsBody items={activeSessions} />
        </Card>

        <Card padding="md">
          <CardHeader
            title="Recent checks"
            subtitle="Latest compliance results from Revit"
          />
          <RecentChecksBody items={recentChecks} />
        </Card>
      </section>
    </div>
  );
}

// --- subcomponents ---------------------------------------------------------

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

function InsightsBody({ items, projectsById }) {
  if (items === null) return <SkeletonGroup count={4} />;
  if (items.length === 0) {
    return (
      <EmptyState
        icon={Sparkles}
        title="No insights yet"
        description="As you create projects and tasks, AI insights will appear here."
        size="sm"
      />
    );
  }
  return (
    <ul className={styles.insightList}>
      {items.map((i) => {
        const Icon = INSIGHT_ICON[i.type] ?? Lightbulb;
        const project = projectsById[i.project_id];
        const intent =
          i.type === "delay_risk" || i.type === "bottleneck"
            ? "warning"
            : "primary";
        return (
          <li key={i.id} className={styles.insightRow}>
            <span
              className={`${styles.insightIcon} ${styles[`intent-${intent}`]}`}
              aria-hidden="true"
            >
              <Icon size={16} strokeWidth={2} />
            </span>
            <div className={styles.insightBody}>
              <span className={styles.insightContent}>{i.content}</span>
              <span className={styles.insightMeta}>
                {project?.name ?? "—"}
                <span className={styles.dotSep}>·</span>
                {relativeTime(i.timestamp)}
              </span>
            </div>
          </li>
        );
      })}
    </ul>
  );
}

function ActiveProjectsRow({ projects, tasksByProject }) {
  if (projects === null) {
    return (
      <div className={styles.projectScroll}>
        {[0, 1, 2].map((i) => (
          <div key={i} className={styles.projectCardSkeleton}>
            <Skeleton width="60%" height={20} />
            <Skeleton width="40%" height={14} />
            <Skeleton width="100%" height={4} />
            <Skeleton width="80%" height={14} />
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
          description="Create a new project or move an existing one to active status to see it here."
          size="md"
        />
      </Card>
    );
  }
  return (
    <div className={styles.projectScroll}>
      {projects.map((p) => (
        <ProjectCard
          key={p.id}
          project={p}
          tasks={tasksByProject?.[p.id]}
        />
      ))}
    </div>
  );
}

function ProjectCard({ project, tasks }) {
  const navigate = useNavigate();
  const tasksLoaded = Array.isArray(tasks);
  const total = tasksLoaded ? tasks.length : 0;
  const done = tasksLoaded
    ? tasks.filter((t) => t.status === "done").length
    : 0;
  const days = daysFromToday(project.deadline);
  const deadlineUrgent = days !== null && days >= 0 && days < 7;
  const deadlineOverdue = days !== null && days < 0;

  return (
    <Card
      interactive
      className={styles.projectCard}
      onClick={() => navigate(`/project/${project.id}`)}
    >
      <header className={styles.projectCardHeader}>
        <h3 className={styles.projectCardTitle} title={project.name}>
          {project.name}
        </h3>
        <Badge status={project.status} dot size="sm">
          {project.status}
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
            deadlineOverdue
              ? styles.deadlineOverdue
              : deadlineUrgent
              ? styles.deadlineUrgent
              : styles.deadline
          }
        >
          {project.deadline ? (
            <>
              <span className={styles.deadlineDate}>
                {shortDate(project.deadline)}
              </span>
              <span className={styles.deadlineRel}>
                {deadlinePhrase(project.deadline)}
              </span>
            </>
          ) : (
            <span className={styles.deadlineRel}>No deadline</span>
          )}
        </span>
        <AvatarStack users={project.members ?? []} max={3} size="sm" />
      </div>
    </Card>
  );
}

function ActiveSessionsBody({ items }) {
  if (items === null) return <SkeletonGroup count={3} />;
  if (items.length === 0) {
    return (
      <EmptyState
        icon={Inbox}
        title="No one online"
        description="Active sessions show up here as soon as a teammate logs in."
        size="sm"
      />
    );
  }
  return (
    <ul className={styles.sessionList}>
      {items.map((s) => (
        <li key={s.id} className={styles.sessionRow}>
          <Avatar name={s.user_name} size="md" />
          <div className={styles.sessionBody}>
            <span className={styles.sessionName}>{s.user_name}</span>
            <span className={styles.sessionMeta}>
              {s.active_project_name ? (
                <>
                  on{" "}
                  <span className={styles.strong}>
                    {s.active_project_name}
                  </span>
                </>
              ) : (
                "no project selected"
              )}
              <span className={styles.dotSep}>·</span>
              {relativeTime(s.login_time)}
            </span>
          </div>
          <span className={styles.sessionDot} aria-hidden="true" />
        </li>
      ))}
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
                  ? `${issuesCount} ${
                      issuesCount === 1 ? "issue" : "issues"
                    }`
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
