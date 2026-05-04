/**
 * ProjectDetail — header + tab bar + per-tab body.
 *
 * Tabs are URL-bound via `?tab=` so refreshes preserve the selected tab
 * and tabs can be deep-linked from elsewhere. The page fans out every
 * fetch in parallel on mount so each tab body has its data ready by the
 * time the user clicks it.
 */
import React, { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import {
  AlertOctagon,
  AlertTriangle,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  ExternalLink,
  Inbox,
  Lightbulb,
  Sparkles,
  XCircle,
} from "lucide-react";
import {
  Avatar,
  Badge,
  Button,
  Card,
  CardHeader,
  EmptyState,
  ProgressBar,
  Skeleton,
  SkeletonGroup,
  TabPanel,
  Tabs,
} from "../components/ui";
import {
  generateInsights,
  getProject,
  getProjectChecks,
  getProjectFiles,
  getProjectInsights,
  getProjectTasks,
} from "../api";
import { GanttChart } from "../components/Gantt";
import { SourceBadge } from "../components/files/SourceBadge";
import { usePageTitle } from "../hooks/usePageTitle";
import {
  daysFromToday,
  deadlinePhrase,
  relativeTime,
  shortDate,
} from "../lib/dates";
import styles from "./ProjectDetail.module.css";

// --- mappings --------------------------------------------------------------

const KANBAN_COLUMNS = [
  { key: "todo", label: "Todo" },
  { key: "in-progress", label: "In progress" },
  { key: "review", label: "Review" },
  { key: "done", label: "Done" },
];

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

const INSIGHT_ICON = {
  delay_risk: AlertTriangle,
  bottleneck: AlertOctagon,
  progress_summary: Lightbulb,
};

const TABS = [
  { key: "overview", label: "Overview" },
  { key: "tasks", label: "Tasks" },
  { key: "gantt", label: "Gantt" },
  { key: "files", label: "Files" },
  { key: "checks", label: "Checks" },
  { key: "insights", label: "Insights" },
];

// --- page ------------------------------------------------------------------

export default function ProjectDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const activeTab =
    TABS.find((t) => t.key === searchParams.get("tab"))?.key ?? "overview";

  const [project, setProject] = useState(null);
  const [tasks, setTasks] = useState(null);
  const [files, setFiles] = useState(null);
  const [checks, setChecks] = useState(null);
  const [insights, setInsights] = useState(null);
  const [generating, setGenerating] = useState(false);
  const [notFound, setNotFound] = useState(false);

  // Push the loaded project's name into the topbar + document title.
  usePageTitle(project?.name);

  // Fan out everything in parallel on mount.
  useEffect(() => {
    let cancelled = false;
    Promise.allSettled([
      getProject(id),
      getProjectTasks(id),
      getProjectFiles(id),
      getProjectChecks(id),
      getProjectInsights(id),
    ]).then(([projR, tasksR, filesR, checksR, insR]) => {
      if (cancelled) return;
      if (projR.status === "fulfilled") {
        setProject(projR.value);
      } else {
        setNotFound(true);
      }
      setTasks(tasksR.status === "fulfilled" ? tasksR.value : []);
      setFiles(filesR.status === "fulfilled" ? filesR.value : []);
      setChecks(checksR.status === "fulfilled" ? checksR.value : []);
      setInsights(insR.status === "fulfilled" ? insR.value : []);
    });
    return () => {
      cancelled = true;
    };
  }, [id]);

  const setTab = (key) => {
    // Use URL state so a refresh keeps the user on the same tab. Keep any
    // other params (we don't currently set any but be defensive).
    const next = new URLSearchParams(searchParams);
    if (key === "overview") next.delete("tab");
    else next.set("tab", key);
    setSearchParams(next, { replace: false });
  };

  // Per-tab counts shown next to the tab labels. Hidden until the
  // underlying fetch lands so we don't render "0" before it loads.
  const tabsWithCounts = useMemo(
    () => [
      TABS[0],
      { ...TABS[1], count: tasks?.length },
      TABS[2], // Gantt — no count
      { ...TABS[3], count: files?.length },
      { ...TABS[4], count: checks?.length },
      { ...TABS[5], count: insights?.length },
    ],
    [tasks, files, checks, insights]
  );

  const handleGenerate = async () => {
    if (generating) return;
    setGenerating(true);
    try {
      await generateInsights(id);
      const fresh = await getProjectInsights(id);
      setInsights(fresh);
    } catch (err) {
      // Soft fail — the existing list stays in place.
      console.warn("generateInsights failed", err);
    } finally {
      setGenerating(false);
    }
  };

  if (notFound) {
    return (
      <div className={styles.page}>
        <Card padding="none">
          <EmptyState
            icon={Inbox}
            title="Project not found"
            description="It may have been moved or you don't have access to it."
            action={
              <Button variant="secondary" onClick={() => navigate("/portfolio")}>
                Back to Portfolio
              </Button>
            }
          />
        </Card>
      </div>
    );
  }

  return (
    <div className={styles.page}>
      <ProjectHeader
        project={project}
        tasks={tasks}
        onGenerate={handleGenerate}
        generating={generating}
      />

      <Tabs
        tabs={tabsWithCounts}
        value={activeTab}
        onChange={setTab}
        ariaLabel="Project sections"
      />

      <TabPanel active={activeTab === "overview"}>
        <OverviewTab project={project} tasks={tasks} files={files} />
      </TabPanel>
      <TabPanel active={activeTab === "tasks"}>
        <TasksTab tasks={tasks} project={project} />
      </TabPanel>
      <TabPanel active={activeTab === "gantt"}>
        <ProjectGanttTab project={project} tasks={tasks} />
      </TabPanel>
      <TabPanel active={activeTab === "files"}>
        <FilesTab files={files} />
      </TabPanel>
      <TabPanel active={activeTab === "checks"}>
        <ChecksTab checks={checks} />
      </TabPanel>
      <TabPanel active={activeTab === "insights"}>
        <InsightsTab
          insights={insights}
          onGenerate={handleGenerate}
          generating={generating}
        />
      </TabPanel>
    </div>
  );
}

// --- header ----------------------------------------------------------------

function ProjectHeader({ project, tasks, onGenerate, generating }) {
  if (!project) {
    return (
      <header className={styles.header}>
        <Skeleton width={280} height={28} />
        <Skeleton width="60%" height={14} />
        <Skeleton width="100%" height={14} />
      </header>
    );
  }
  const days = daysFromToday(project.deadline);
  const deadlineUrgent = days !== null && days >= 0 && days < 7;
  const deadlineOverdue = days !== null && days < 0;
  const total = tasks?.length ?? 0;
  const done = tasks?.filter?.((t) => t.status === "done").length ?? 0;

  return (
    <header className={styles.header}>
      <div className={styles.headerTop}>
        <div className={styles.titleBlock}>
          <h1 className={styles.title}>{project.name}</h1>
          <div className={styles.headerMeta}>
            <Badge status={project.status} dot size="md">
              {project.status === "on-hold" ? "On hold" : project.status}
            </Badge>
            {project.deadline && (
              <span
                className={
                  deadlineOverdue
                    ? styles.deadlineOverdue
                    : deadlineUrgent
                    ? styles.deadlineUrgent
                    : styles.deadline
                }
              >
                <span className={styles.deadlineLabel}>Due</span>
                <span className={styles.deadlineDate}>
                  {shortDate(project.deadline)}
                </span>
                <span className={styles.deadlineRel}>
                  {deadlinePhrase(project.deadline)}
                </span>
              </span>
            )}
          </div>
        </div>
        <Button
          variant="secondary"
          size="sm"
          leadingIcon={<Sparkles size={14} />}
          onClick={onGenerate}
          disabled={generating}
        >
          {generating ? "Generating…" : "Generate insights"}
        </Button>
      </div>

      {project.description && (
        <p className={styles.description}>{project.description}</p>
      )}

      {tasks && tasks.length > 0 && (
        <ProgressBar
          value={done}
          max={total}
          intent={done === total ? "success" : "primary"}
          showLabel
          label={`${done} of ${total} tasks complete`}
        />
      )}
    </header>
  );
}

// --- Overview tab ----------------------------------------------------------

function OverviewTab({ project, tasks, files }) {
  // useMemo MUST run on every render — keep it above any early return.
  // Real audit-log + events feed is out of scope; this is the honest
  // approximation given existing endpoints (tasks fall back to due_date
  // as an ordering signal since they don't carry created_at; files have
  // a real created_at).
  const activity = useMemo(() => {
    const entries = [];
    if (Array.isArray(tasks)) {
      for (const t of tasks) {
        entries.push({
          id: `task-${t.id}`,
          kind: "task",
          title: t.title,
          status: t.status,
          when: t.due_date,
        });
      }
    }
    if (Array.isArray(files)) {
      for (const f of files) {
        entries.push({
          id: `file-${f.id}`,
          kind: "file",
          title: f.name,
          source: f.source,
          when: f.created_at,
        });
      }
    }
    // Most recent first; entries with no `when` go to the end.
    entries.sort((a, b) => {
      if (!a.when && !b.when) return 0;
      if (!a.when) return 1;
      if (!b.when) return -1;
      return new Date(b.when) - new Date(a.when);
    });
    return entries.slice(0, 8);
  }, [tasks, files]);

  if (!project) return <SkeletonGroup count={4} />;
  const members = project.members ?? [];

  return (
    <div className={styles.overviewGrid}>
      <Card padding="md">
        <CardHeader title="Members" subtitle={`${members.length} on this project`} />
        {members.length === 0 ? (
          <EmptyState
            icon={Inbox}
            title="No members yet"
            description="Add team members to this project from the API."
            size="sm"
          />
        ) : (
          <ul className={styles.memberList}>
            {members.map((m) => (
              <li key={m.id} className={styles.memberRow}>
                <Avatar name={m.name} email={m.email} size="md" />
                <div className={styles.memberMeta}>
                  <span className={styles.memberName}>{m.name}</span>
                  <span className={styles.memberEmail}>{m.email}</span>
                </div>
                <Badge
                  variant={m.role === "admin" ? "primary" : "neutral"}
                  size="sm"
                >
                  {m.role}
                </Badge>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Card padding="md">
        <CardHeader title="Recent activity" subtitle="Latest tasks and files" />
        {activity.length === 0 ? (
          <EmptyState
            icon={Sparkles}
            title="Nothing yet"
            description="Tasks and files added to this project will surface here."
            size="sm"
          />
        ) : (
          <ul className={styles.activityList}>
            {activity.map((a) => (
              <li key={a.id} className={styles.activityRow}>
                <span
                  className={`${styles.activityDot} ${
                    a.kind === "task" ? styles.dotTask : styles.dotFile
                  }`}
                  aria-hidden="true"
                />
                <span className={styles.activityTitle}>{a.title}</span>
                <span className={styles.activityMeta}>
                  {a.kind === "task" ? a.status : a.source}
                  <span className={styles.dotSep}>·</span>
                  {a.when ? relativeTime(a.when) : "—"}
                </span>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}

// --- Tasks tab (kanban) ----------------------------------------------------

function TasksTab({ tasks, project }) {
  if (tasks === null) {
    return (
      <div className={styles.kanban}>
        {KANBAN_COLUMNS.map((col) => (
          <Card key={col.key} padding="md">
            <CardHeader title={col.label} />
            <SkeletonGroup count={3} />
          </Card>
        ))}
      </div>
    );
  }
  const grouped = Object.fromEntries(KANBAN_COLUMNS.map((c) => [c.key, []]));
  for (const t of tasks) {
    if (grouped[t.status]) grouped[t.status].push(t);
  }

  // Quick lookup for the assignee avatar — falls back to project.members.
  const memberById = Object.fromEntries(
    (project?.members ?? []).map((m) => [m.id, m])
  );

  return (
    <div className={styles.kanban}>
      {KANBAN_COLUMNS.map((col) => {
        const colTasks = grouped[col.key];
        return (
          <Card key={col.key} padding="md" className={styles.kanbanColumn}>
            <header className={styles.kanbanHeader}>
              <span className={styles.kanbanTitle}>{col.label}</span>
              <span className={styles.kanbanCount}>{colTasks.length}</span>
            </header>
            {colTasks.length === 0 ? (
              <div className={styles.kanbanEmpty}>No tasks</div>
            ) : (
              <ul className={styles.kanbanList}>
                {colTasks.map((t) => {
                  const assignee = t.assigned_user_id
                    ? memberById[t.assigned_user_id]
                    : null;
                  const days = daysFromToday(t.due_date);
                  const isOverdue = days !== null && days < 0;
                  return (
                    <li key={t.id} className={styles.kanbanCard}>
                      <span className={styles.kanbanCardTitle}>{t.title}</span>
                      <div className={styles.kanbanCardFooter}>
                        <Badge
                          variant={PRIORITY_TO_VARIANT[t.priority] ?? "neutral"}
                          size="sm"
                        >
                          {t.priority}
                        </Badge>
                        {t.due_date && (
                          <span
                            className={`${styles.kanbanDue} ${
                              isOverdue ? styles.kanbanDueOverdue : ""
                            }`}
                          >
                            {shortDate(t.due_date)}
                          </span>
                        )}
                        {assignee ? (
                          <Avatar
                            name={assignee.name}
                            email={assignee.email}
                            size="sm"
                            title={assignee.name}
                          />
                        ) : (
                          <span aria-hidden="true" />
                        )}
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </Card>
        );
      })}
    </div>
  );
}

// --- Gantt tab (per-project) -----------------------------------------------

const TASK_STATUS_PROGRESS = {
  todo: 0,
  "in-progress": 50,
  review: 75,
  done: 100,
};

const PRIORITY_BAR_COLOR = {
  high: "#ef4444",
  medium: "#f59e0b",
  low: "#5865f2",
};

const SECTION_ORDER = [
  { key: "todo", label: "Todo" },
  { key: "in-progress", label: "In progress" },
  { key: "review", label: "Review" },
  { key: "done", label: "Done" },
];

const SYNTHETIC_TASK_DURATION_DAYS = 7;

function ProjectGanttTab({ project, tasks }) {
  // Hook always called — keep above any early returns to satisfy
  // rules-of-hooks. Builds the GanttChart `rows` prop: a flat list
  // alternating section-header rows and task rows, ordered by status.
  const ganttRows = useMemo(() => {
    if (!Array.isArray(tasks)) return null;
    const datedTasks = tasks.filter((t) => t.due_date);
    if (datedTasks.length === 0) return [];

    // Group dated tasks by status.
    const grouped = {};
    for (const status of SECTION_ORDER) {
      grouped[status.key] = [];
    }
    for (const t of datedTasks) {
      if (grouped[t.status]) grouped[t.status].push(t);
    }

    const memberById = Object.fromEntries(
      (project?.members ?? []).map((m) => [m.id, m])
    );

    const out = [];
    for (const { key, label } of SECTION_ORDER) {
      const ts = grouped[key];
      if (ts.length === 0) continue;
      out.push({
        kind: "section",
        id: `sec-${key}`,
        label,
        count: ts.length,
      });
      for (const t of ts) {
        const end = new Date(t.due_date);
        const start = new Date(end);
        start.setDate(start.getDate() - SYNTHETIC_TASK_DURATION_DAYS);
        const colour =
          PRIORITY_BAR_COLOR[t.priority] ?? PRIORITY_BAR_COLOR.low;
        const assignee = t.assigned_user_id
          ? memberById[t.assigned_user_id]
          : null;
        out.push({
          kind: "row",
          id: `task-${t.id}`,
          label: t.title,
          start,
          end,
          color: colour,
          progress: TASK_STATUS_PROGRESS[t.status] ?? 0,
          avatar: assignee
            ? { name: assignee.name, email: assignee.email }
            : null,
          meta: t.priority ? `Priority: ${t.priority}` : undefined,
        });
      }
    }
    return out;
  }, [tasks, project]);

  if (!project) return <SkeletonGroup count={4} />;
  if (ganttRows === null) return <SkeletonGroup count={4} />;

  const tasksWithoutDue =
    (tasks ?? []).length -
    (Array.isArray(tasks) ? tasks.filter((t) => t.due_date).length : 0);

  return (
    <div className={styles.ganttTab}>
      <Card className={styles.ganttNote}>
        <span>
          Bar color shows priority (red high, amber medium, indigo low);
          fill shows status progress. Each task is rendered as a{" "}
          {SYNTHETIC_TASK_DURATION_DAYS}-day window ending at its due
          date until tasks store a real start date.
        </span>
      </Card>
      {tasksWithoutDue > 0 && (
        <Card className={styles.ganttNote}>
          <span>
            {tasksWithoutDue}{" "}
            {tasksWithoutDue === 1 ? "task is" : "tasks are"} missing a
            due date and aren't on the timeline.
          </span>
        </Card>
      )}
      <GanttChart
        rows={ganttRows}
        viewMode="month"
        emptyTitle="No tasks with due dates yet"
        emptyDescription="Set a due date on at least one task to populate the timeline."
      />
    </div>
  );
}

// --- Files tab -------------------------------------------------------------

function FilesTab({ files }) {
  if (files === null) return <SkeletonGroup count={4} />;
  if (files.length === 0) {
    return (
      <Card padding="none">
        <EmptyState
          icon={Inbox}
          title="No files registered"
          description="Files registered to this project (BIM 360, ACC, or uploaded links) appear here."
        />
      </Card>
    );
  }
  return (
    <Card padding="none">
      <ul className={styles.fileList}>
        {files.map((f) => (
          <li key={f.id} className={styles.fileRow}>
            <SourceBadge source={f.source} />
            <a
              href={f.url}
              target="_blank"
              rel="noreferrer noopener"
              className={styles.fileLink}
              title={f.url}
            >
              {f.name}
              <ExternalLink size={12} className={styles.linkIcon} />
            </a>
            <span className={styles.fileMeta}>
              {f.created_at ? relativeTime(f.created_at) : "—"}
            </span>
          </li>
        ))}
      </ul>
    </Card>
  );
}

// --- Checks tab ------------------------------------------------------------

function ChecksTab({ checks }) {
  if (checks === null) return <SkeletonGroup count={4} />;
  if (checks.length === 0) {
    return (
      <Card padding="none">
        <EmptyState
          icon={CheckCircle2}
          title="No checks yet"
          description="Compliance results streamed in from the Revit plugin will land here."
        />
      </Card>
    );
  }
  return (
    <Card padding="none">
      <ul className={styles.checkList}>
        {checks.map((c) => (
          <CheckRow key={c.id} check={c} />
        ))}
      </ul>
    </Card>
  );
}

function CheckRow({ check }) {
  const [open, setOpen] = useState(false);
  const Icon = CHECK_ICON[check.status] ?? CheckCircle2;
  const intent = CHECK_INTENT[check.status] ?? "neutral";
  const issuesCount = check.issues?.length ?? 0;
  const Chevron = open ? ChevronUp : ChevronDown;
  const expandable = issuesCount > 0;

  return (
    <li className={styles.checkRow}>
      <button
        type="button"
        className={styles.checkRowMain}
        onClick={() => expandable && setOpen((v) => !v)}
        aria-expanded={open}
        disabled={!expandable}
      >
        <span
          className={`${styles.checkIcon} ${styles[`intent-${intent}`]}`}
          aria-hidden="true"
        >
          <Icon size={16} strokeWidth={2} />
        </span>
        <div className={styles.checkBody}>
          <span className={styles.checkType}>
            {check.check_type.replace(/_/g, " ")}
          </span>
          <span className={styles.checkMeta}>
            {issuesCount === 0
              ? "no issues"
              : `${issuesCount} ${issuesCount === 1 ? "issue" : "issues"}`}
            <span className={styles.dotSep}>·</span>
            {relativeTime(check.timestamp)}
          </span>
        </div>
        <Badge variant={intent} size="sm">
          {check.status}
        </Badge>
        {expandable && <Chevron size={14} className={styles.chevron} />}
      </button>
      {open && expandable && (
        <ul className={styles.issuesList}>
          {check.issues.map((issue, i) => (
            <li key={i} className={styles.issueRow}>
              {issue.element_id != null && (
                <span className={styles.elementId}>#{issue.element_id}</span>
              )}
              <span className={styles.issueText}>
                {issue.issue ?? JSON.stringify(issue)}
              </span>
            </li>
          ))}
        </ul>
      )}
    </li>
  );
}

// --- Insights tab ----------------------------------------------------------

function InsightsTab({ insights, onGenerate, generating }) {
  if (insights === null) return <SkeletonGroup count={4} />;
  if (insights.length === 0) {
    return (
      <Card padding="none">
        <EmptyState
          icon={Sparkles}
          title="No insights yet"
          description="Generate the first batch — the AI will look at your tasks and deadline to surface delay risk and progress patterns."
          action={
            <Button
              variant="primary"
              leadingIcon={<Sparkles size={14} />}
              onClick={onGenerate}
              disabled={generating}
            >
              {generating ? "Generating…" : "Generate insights"}
            </Button>
          }
        />
      </Card>
    );
  }
  return (
    <Card padding="md">
      <ul className={styles.insightList}>
        {insights.map((i) => {
          const Icon = INSIGHT_ICON[i.type] ?? Lightbulb;
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
                  {i.type.replace(/_/g, " ")}
                  <span className={styles.dotSep}>·</span>
                  {relativeTime(i.timestamp)}
                </span>
              </div>
            </li>
          );
        })}
      </ul>
    </Card>
  );
}
