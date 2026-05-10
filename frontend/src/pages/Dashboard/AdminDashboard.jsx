/**
 * AdminDashboard — firm-wide overview for the admin role.
 *
 * Sections:
 *   1. Stat row   — active projects, team online, total insights, open risks
 *   2. Portfolio  — all projects as a scrollable list with progress
 *   3. Recent firm insights — /insights/firm/ (admin-only endpoint)
 *   4. Team activity — active sessions
 */
import React, { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useUser } from "../../contexts/UserContext";
import {
  Activity,
  AlertOctagon,
  AlertTriangle,
  BarChart3,
  FolderOpen,
  Lightbulb,
  Sparkles,
  Users,
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
import {
  getFirmInsights,
  getProjectTasks,
  getRecentEvents,
  listProjects,
} from "../../api";
import { WhoIsOnline } from "../../components/WhoIsOnline/WhoIsOnline";
import { daysFromToday, deadlinePhrase, relativeTime } from "../../lib/dates";
import styles from "./Dashboard.module.css";

const STATUS_TO_VARIANT = {
  active: "primary",
  "on-hold": "warning",
  completed: "success",
  archived: "neutral",
};

const INSIGHT_ICON = {
  delay_risk: AlertTriangle,
  bottleneck: AlertOctagon,
  progress_summary: Lightbulb,
};

export default function AdminDashboard() {
  const navigate = useNavigate();
  const { modules } = useUser();
  const [projects, setProjects] = useState(null);
  const [tasksByProject, setTasksByProject] = useState(null);
  const [insights, setInsights] = useState(null);
  const [recentEvents, setRecentEvents] = useState(null);
  const [error, setError] = useState(null);

  // First batch
  useEffect(() => {
    let cancelled = false;
    Promise.allSettled([
      listProjects(),
      getFirmInsights(15),
      getRecentEvents(8),
    ]).then(([projR, insR, evtR]) => {
      if (cancelled) return;
      if (projR.status === "fulfilled") setProjects(projR.value);
      else setError("Could not load projects.");
      setInsights(insR.status === "fulfilled" ? insR.value : []);
      setRecentEvents(evtR.status === "fulfilled" ? evtR.value : []);
    });
    return () => { cancelled = true; };
  }, []);

  // Second batch: per-project tasks for progress calculation
  useEffect(() => {
    if (!projects) return;
    let cancelled = false;
    if (projects.length === 0) { setTasksByProject({}); return; }
    Promise.all(
      projects.map((p) =>
        getProjectTasks(p.id)
          .then((t) => [p.id, t])
          .catch(() => [p.id, []])
      )
    ).then((entries) => {
      if (cancelled) return;
      setTasksByProject(Object.fromEntries(entries));
    });
    return () => { cancelled = true; };
  }, [projects]);

  // Derived stats
  const activeProjects = useMemo(
    () => (projects ? projects.filter((p) => p.status === "active") : null),
    [projects]
  );

  // Tasks past due date and not completed
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

  // Modules currently enabled for the firm
  const activeModulesCount = useMemo(
    () => modules.filter((m) => m.is_active).length,
    [modules]
  );

  return (
    <div className={styles.page}>
      {error && (
        <Card className={styles.errorCard}>
          <strong>Couldn't fully load the dashboard.</strong>{" "}
          <span style={{ color: "var(--color-text-secondary)" }}>{error}</span>
        </Card>
      )}

      {/* --- 1. Stat row ------------------------------------------------- */}
      <div className={styles.statsRow}>
        <StatCard
          label="Active projects"
          value={activeProjects === null ? "—" : activeProjects.length}
          icon={<FolderOpen />}
          tooltip="Projects currently in active status across the firm"
          onClick={() => navigate("/portfolio?status=active")}
        />
        <StatCard
          label="Team online"
          value="—"
          icon={<Users />}
          tooltip="See the Who's Online section below"
          onClick={() => navigate("/portfolio")}
        />
        <StatCard
          label="Tasks overdue"
          value={overdueTasksCount === null ? "—" : overdueTasksCount}
          icon={<AlertTriangle />}
          tooltip="Tasks past their due date that are not yet completed"
          trendIntent={overdueTasksCount > 0 ? "negative" : "neutral"}
          onClick={() => navigate("/tasks?filter=overdue")}
        />
        <StatCard
          label="Modules active"
          value={activeModulesCount}
          icon={<BarChart3 />}
          tooltip="Vitruvius Connect modules currently enabled for your firm"
          onClick={() => navigate("/settings?tab=modules")}
        />
      </div>

      {/* --- 2. Portfolio ------------------------------------------------ */}
      <section className={styles.section}>
        <header className={styles.sectionHeader}>
          <h2 className={styles.sectionTitle}>All projects</h2>
          {projects && (
            <span className={styles.sectionMeta}>
              {projects.length} total
            </span>
          )}
        </header>
        <Card padding="md">
          <PortfolioList
            projects={projects}
            tasksByProject={tasksByProject}
          />
        </Card>
      </section>

      {/* --- 3. Firm insights + team ------------------------------------- */}
      <section className={styles.row2}>
        <Card padding="md">
          <CardHeader
            title="Firm insights"
            subtitle="AI signals across all projects"
          />
          <FirmInsightsBody items={insights} />
        </Card>

        <Card padding="md">
          <CardHeader
            title="Who's online"
            subtitle="Heartbeat-based presence · refreshes every 60 s"
          />
          <WhoIsOnline />
        </Card>
      </section>

      {/* --- 4. Recent Revit activity ------------------------------------ */}
      <section className={styles.section}>
        <header className={styles.sectionHeader}>
          <h2 className={styles.sectionTitle}>Revit activity</h2>
          <span className={styles.sectionMeta}>Recent model events</span>
        </header>
        <Card padding="md">
          <RecentEventsBody items={recentEvents} />
        </Card>
      </section>
    </div>
  );
}

// --- subcomponents ---------------------------------------------------------

function PortfolioList({ projects, tasksByProject }) {
  const navigate = useNavigate();

  if (projects === null) return <SkeletonGroup count={5} />;
  if (projects.length === 0) {
    return (
      <EmptyState
        icon={Sparkles}
        title="No projects yet"
        description="Create your first project to see it here."
        size="sm"
      />
    );
  }

  return (
    <ul className={styles.portfolioList}>
      {projects.map((p) => {
        const tasks = tasksByProject?.[p.id];
        const tasksLoaded = Array.isArray(tasks);
        const total = tasksLoaded ? tasks.length : 0;
        const done = tasksLoaded ? tasks.filter((t) => t.status === "done").length : 0;
        const days = daysFromToday(p.deadline);
        const overdue = days !== null && days < 0;
        const urgent = days !== null && days >= 0 && days < 7;

        return (
          <li
            key={p.id}
            className={styles.portfolioRow}
            style={{ cursor: "pointer" }}
            onClick={() => navigate(`/project/${p.id}`)}
          >
            <div className={styles.portfolioBody}>
              <span className={styles.portfolioName}>{p.name}</span>
              <span className={styles.portfolioMeta}>
                {p.deadline ? (
                  <span className={overdue ? styles.overdue : urgent ? styles.deadlineUrgent : undefined}>
                    {deadlinePhrase(p.deadline)}
                  </span>
                ) : (
                  "No deadline"
                )}
              </span>
            </div>

            <div className={styles.portfolioProgress}>
              {tasksLoaded ? (
                <ProgressBar
                  value={done}
                  max={Math.max(total, 1)}
                  intent={total > 0 && done === total ? "success" : "primary"}
                  showLabel
                  label={`${done}/${total}`}
                />
              ) : (
                <Skeleton width="100%" height={4} />
              )}
            </div>

            <AvatarStack users={p.members ?? []} max={3} size="sm" />
            <Badge variant={STATUS_TO_VARIANT[p.status] ?? "neutral"} size="sm">
              {p.status}
            </Badge>
          </li>
        );
      })}
    </ul>
  );
}

function FirmInsightsBody({ items }) {
  if (items === null) return <SkeletonGroup count={4} />;
  if (items.length === 0) {
    return (
      <EmptyState
        icon={Sparkles}
        title="No insights yet"
        description="Generate insights on any project to see them here."
        size="sm"
      />
    );
  }
  return (
    <ul className={styles.insightList}>
      {items.map((i) => {
        const Icon = INSIGHT_ICON[i.type] ?? Lightbulb;
        const intent =
          i.type === "delay_risk" || i.type === "bottleneck" ? "warning" : "primary";
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
                {i.project_name ?? "—"}
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

const EVENT_TYPE_LABEL = {
  opened:    "Opened",
  synced:    "Synced",
  closed:    "Closed",
  check_run: "Check run",
};

function RecentEventsBody({ items }) {
  if (items === null) return <SkeletonGroup count={4} />;
  if (items.length === 0) {
    return (
      <EmptyState
        icon={Activity}
        title="No Revit activity yet"
        description="Model events from the Revit plugin will appear here once architects start working."
        size="sm"
      />
    );
  }
  return (
    <ul className={styles.checkList}>
      {items.map((e) => (
        <li key={e.id} className={styles.checkRow}>
          <span
            className={`${styles.checkIcon} ${styles["intent-primary"]}`}
            aria-hidden="true"
          >
            <Activity size={16} strokeWidth={2} />
          </span>
          <div className={styles.checkBody}>
            <span className={styles.checkType}>
              {EVENT_TYPE_LABEL[e.event_type] ?? e.event_type}
              {e.revit_file_name && (
                <> &mdash; <em style={{ fontStyle: "normal", opacity: 0.85 }}>{e.revit_file_name}</em></>
              )}
            </span>
            <span className={styles.checkMeta}>
              {e.user_name ?? "Unknown user"}
              {e.project_name && (
                <>
                  <span className={styles.dotSep}>·</span>
                  {e.project_name}
                </>
              )}
              <span className={styles.dotSep}>·</span>
              {relativeTime(e.timestamp)}
            </span>
          </div>
        </li>
      ))}
    </ul>
  );
}

/* ActiveSessionsBody removed — replaced by <WhoIsOnline /> component */
