/**
 * ArchitectDashboard — personal work view for the architect role.
 *
 * Sections:
 *   1. My Work (two cols):
 *      left  — Due soon (tasks assigned to me, next 7 days)
 *      right — AI Insights + inline "Ask Vitruvius" expandable panel
 *   2. My active projects (horizontal scroll)
 *   3. Team activity (who's online + recent checks)
 */
import React, { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  Activity,
  AlertOctagon,
  AlertTriangle,
  ChevronDown,
  ChevronUp,
  Inbox,
  Lightbulb,
  LoaderCircle,
  SendHorizontal,
  Sparkles,
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
import { useUser } from "../../contexts/UserContext";
import {
  askVitruvius,
  getProjectTasks,
  getRecentEvents,
  getRecentInsights,
  listProjects,
} from "../../api";
import { WhoIsOnline } from "../../components/WhoIsOnline/WhoIsOnline";
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

const INSIGHT_ICON = {
  delay_risk: AlertTriangle,
  bottleneck: AlertOctagon,
  progress_summary: Lightbulb,
};

const EVENT_TYPE_LABEL = {
  opened:    "Opened",
  synced:    "Synced",
  closed:    "Closed",
  check_run: "Check run",
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

export default function ArchitectDashboard() {
  const navigate = useNavigate();
  const { user } = useUser();
  const [projects, setProjects]           = useState(null);
  const [tasksByProject, setTasksByProject] = useState(null);
  const [insights, setInsights]           = useState(null);
  const [recentEvents, setRecentEvents] = useState(null);
  const [error, setError]               = useState(null);

  // First batch
  useEffect(() => {
    let cancelled = false;
    Promise.allSettled([
      listProjects(),
      getRecentInsights(5),
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

  // Second batch: per-project tasks
  useEffect(() => {
    if (!projects) return;
    let cancelled = false;
    if (projects.length === 0) { setTasksByProject({}); return; }
    Promise.all(
      projects.map((p) =>
        getProjectTasks(p.id).then((t) => [p.id, t]).catch(() => [p.id, []])
      )
    ).then((entries) => {
      if (cancelled) return;
      setTasksByProject(Object.fromEntries(entries));
    });
    return () => { cancelled = true; };
  }, [projects]);

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
    return result.sort((a, b) => (daysFromToday(a.due_date) ?? 0) - (daysFromToday(b.due_date) ?? 0));
  }, [user, tasksByProject, projectsById]);

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

  return (
    <div className={styles.page}>
      {error && (
        <Card className={styles.errorCard}>
          <strong>Couldn't fully load the dashboard.</strong>{" "}
          <span style={{ color: "var(--color-text-secondary)" }}>{error}</span>
        </Card>
      )}

      {/* --- Stat row --------------------------------------------------- */}
      <div className={styles.statsRow}>
        <StatCard
          label="Active projects"
          value={activeProjects === null ? "—" : activeProjects.length}
          tooltip="Projects currently in active status"
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
          label="AI insights"
          value={insights === null ? "—" : insights.length}
          tooltip="AI-generated signals across your projects"
          onClick={() => navigate("/portfolio")}
        />
      </div>

      {/* --- Section 1: My Work ------------------------------------------ */}
      <section className={styles.row2}>
        <Card padding="md">
          <CardHeader
            title="Due soon"
            subtitle={`Tasks assigned to you in the next ${HORIZON_DAYS} days`}
          />
          <DueSoonBody items={myTasksDueSoon} />
        </Card>

        <Card padding="md" style={{ display: "flex", flexDirection: "column" }}>
          <CardHeader
            title="AI insights"
            subtitle="Latest signals across your projects"
          />
          <InsightsBody items={insights} projectsById={projectsById} />
          <AskVitruViusPanel />
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
            subtitle="Heartbeat-based presence · refreshes every 60 s"
          />
          <WhoIsOnline />
        </Card>

        <Card padding="md">
          <CardHeader
            title="Revit activity"
            subtitle="Recent model events across the firm"
          />
          <RecentEventsBody items={recentEvents} />
        </Card>
      </section>
    </div>
  );
}

// --- Ask Vitruvius inline panel ------------------------------------------

function AskVitruViusPanel() {
  const [open, setOpen]         = useState(false);
  const [prompt, setPrompt]     = useState("");
  const [loading, setLoading]   = useState(false);
  const [answer, setAnswer]     = useState(null);
  const [provider, setProvider] = useState(null);
  const [askError, setAskError] = useState(null);
  const textareaRef = useRef(null);

  const handleOpen = () => {
    setOpen((v) => !v);
    if (!open) {
      // Focus textarea on next tick
      setTimeout(() => textareaRef.current?.focus(), 80);
    }
  };

  const handleSubmit = async (e) => {
    e?.preventDefault();
    if (!prompt.trim() || loading) return;
    setLoading(true);
    setAnswer(null);
    setAskError(null);
    try {
      const res = await askVitruvius(prompt.trim());
      setAnswer(res.answer);
      setProvider(res.used_provider);
    } catch (err) {
      setAskError(
        err?.response?.data?.detail ?? "Something went wrong. Please try again."
      );
    } finally {
      setLoading(false);
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  };

  return (
    <>
      {/* Toggle bar */}
      <div className={styles.askToggleBar}>
        <span className={styles.askToggleLabel}>
          <Sparkles size={14} strokeWidth={2} />
          Ask Vitruvius
        </span>
        <button
          type="button"
          onClick={handleOpen}
          aria-expanded={open}
          aria-label={open ? "Close Ask Vitruvius" : "Open Ask Vitruvius"}
          style={{
            background: "none",
            border: "none",
            cursor: "pointer",
            color: "var(--color-text-muted)",
            display: "inline-flex",
            alignItems: "center",
            padding: "var(--space-1)",
            borderRadius: "var(--radius-sm)",
          }}
        >
          {open ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
        </button>
      </div>

      {/* Expandable panel */}
      {open && (
        <div className={styles.askPanel}>
          <form className={styles.askForm} onSubmit={handleSubmit}>
            <textarea
              ref={textareaRef}
              className={styles.askTextarea}
              placeholder="Ask anything about your projects… (Enter to send)"
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              onKeyDown={handleKeyDown}
              disabled={loading}
              rows={2}
            />
            <button
              type="submit"
              disabled={!prompt.trim() || loading}
              aria-label="Send"
              style={{
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                padding: "var(--space-2) var(--space-3)",
                background: "var(--color-primary)",
                color: "#fff",
                border: "none",
                borderRadius: "var(--radius-md)",
                cursor: "pointer",
                opacity: !prompt.trim() || loading ? 0.5 : 1,
                flexShrink: 0,
              }}
            >
              {loading ? (
                <LoaderCircle size={16} style={{ animation: "spin 1s linear infinite" }} />
              ) : (
                <SendHorizontal size={16} />
              )}
            </button>
          </form>

          {askError && (
            <div className={styles.askError}>{askError}</div>
          )}

          {answer && (
            <div className={styles.askAnswer}>
              {answer}
              {provider && (
                <div className={styles.askAnswerMeta}>
                  <Sparkles size={11} />
                  {provider}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      <style>{`
        @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
      `}</style>
    </>
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
            <Badge variant={PRIORITY_TO_VARIANT[t.priority] ?? "neutral"} size="sm">
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
  const navigate = useNavigate();
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
          description="Create a new project or set an existing one to active status."
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
        const done  = tasksLoaded ? tasks.filter((t) => t.status === "done").length : 0;
        const days  = daysFromToday(p.deadline);
        const urgent  = days !== null && days >= 0 && days < 7;
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
              <Badge variant={STATUS_TO_VARIANT[p.status] ?? "neutral"} dot size="sm">
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
                  overdue ? styles.deadlineOverdue : urgent ? styles.deadlineUrgent : styles.deadline
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

/* ActiveSessionsBody removed — replaced by shared <WhoIsOnline /> component */

function RecentEventsBody({ items }) {
  if (items === null) return <SkeletonGroup count={3} />;
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
