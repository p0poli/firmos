/**
 * Tasks — every task assigned to the current user, grouped by project,
 * with quick filters by due-window and a sort selector.
 *
 * Marking a task done is a real mutation: clicking the checkbox PATCHes
 * /tasks/:id with status=done, optimistically updates local state, and
 * rolls back on failure.
 */
import React, { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  ChevronRight,
  CircleCheck,
  Inbox,
  ListChecks,
} from "lucide-react";
import {
  Badge,
  Button,
  Card,
  EmptyState,
  FilterPills,
  SkeletonGroup,
} from "../components/ui";
import {
  getMe,
  getProjectTasks,
  listProjects,
  updateTask,
} from "../api";
import { daysFromToday, deadlinePhrase, shortDate } from "../lib/dates";
import styles from "./Tasks.module.css";

const PRIORITY_TO_VARIANT = {
  high: "danger",
  medium: "warning",
  low: "neutral",
};

const PRIORITY_RANK = { high: 0, medium: 1, low: 2 };

const FILTER_OPTIONS = [
  { value: "all", label: "All" },
  { value: "today", label: "Due today" },
  { value: "week", label: "This week" },
  { value: "overdue", label: "Overdue" },
];

const SORT_OPTIONS = [
  { value: "due", label: "Due date" },
  { value: "priority", label: "Priority" },
  { value: "project", label: "Project" },
];

// --- page ------------------------------------------------------------------

export default function Tasks() {
  const [me, setMe] = useState(null);
  const [projects, setProjects] = useState(null);
  const [tasksByProject, setTasksByProject] = useState(null);
  const [filter, setFilter] = useState("all");
  const [sort, setSort] = useState("due");
  const [collapsed, setCollapsed] = useState({});
  // task ids currently being mutated (so we can disable the click while
  // the request is in flight)
  const [pending, setPending] = useState({});

  // Fetch me + projects, then per-project tasks. Same pattern as
  // Dashboard / Portfolio.
  useEffect(() => {
    let cancelled = false;
    Promise.allSettled([getMe(), listProjects()]).then((results) => {
      if (cancelled) return;
      const [meR, projR] = results;
      if (meR.status === "fulfilled") setMe(meR.value);
      if (projR.status === "fulfilled") setProjects(projR.value);
      else setProjects([]);
    });
    return () => {
      cancelled = true;
    };
  }, []);

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
      if (!cancelled) setTasksByProject(Object.fromEntries(entries));
    });
    return () => {
      cancelled = true;
    };
  }, [projects]);

  // Derived: my tasks, project metadata attached, optionally filtered by
  // due window. Sort is applied per-section unless we're sorting by
  // project, in which case the section order itself becomes the sort.
  const grouped = useMemo(() => {
    if (!me || !projects || !tasksByProject) return null;

    const myTasks = [];
    for (const p of projects) {
      const tasks = tasksByProject[p.id] ?? [];
      for (const t of tasks) {
        if (t.assigned_user_id !== me.id) continue;
        myTasks.push({ ...t, _project: p });
      }
    }

    const filtered = myTasks.filter((t) => matchesFilter(t, filter));

    // Sort first; grouping preserves the resulting order within sections.
    const sorted = filtered.slice().sort((a, b) => compareTasks(a, b, sort));

    const sections = new Map();
    for (const t of sorted) {
      const pid = t._project.id;
      if (!sections.has(pid)) sections.set(pid, { project: t._project, tasks: [] });
      sections.get(pid).tasks.push(t);
    }
    return Array.from(sections.values());
  }, [me, projects, tasksByProject, filter, sort]);

  // Filter chips show counts so the user sees what each filter would
  // narrow down to.
  const counts = useMemo(() => {
    if (!me || !tasksByProject) {
      return { all: 0, today: 0, week: 0, overdue: 0 };
    }
    const acc = { all: 0, today: 0, week: 0, overdue: 0 };
    for (const tasks of Object.values(tasksByProject)) {
      for (const t of tasks) {
        if (t.assigned_user_id !== me.id) continue;
        acc.all += 1;
        if (matchesFilter(t, "today")) acc.today += 1;
        if (matchesFilter(t, "week")) acc.week += 1;
        if (matchesFilter(t, "overdue")) acc.overdue += 1;
      }
    }
    return acc;
  }, [me, tasksByProject]);

  const filterOptionsWithCounts = FILTER_OPTIONS.map((o) => ({
    ...o,
    count: counts[o.value],
  }));

  const handleToggleSection = (pid) => {
    setCollapsed((prev) => ({ ...prev, [pid]: !prev[pid] }));
  };

  const handleMarkDone = async (task) => {
    if (pending[task.id]) return;
    if (task.status === "done") return;
    setPending((p) => ({ ...p, [task.id]: true }));

    // Optimistic local update.
    setTasksByProject((prev) => ({
      ...prev,
      [task.project_id]: (prev[task.project_id] ?? []).map((t) =>
        t.id === task.id ? { ...t, status: "done" } : t
      ),
    }));

    try {
      await updateTask(task.id, { status: "done" });
    } catch (err) {
      // Roll back on failure.
      setTasksByProject((prev) => ({
        ...prev,
        [task.project_id]: (prev[task.project_id] ?? []).map((t) =>
          t.id === task.id ? { ...t, status: task.status } : t
        ),
      }));
      console.warn("Failed to mark task done", err);
    } finally {
      setPending((p) => {
        const next = { ...p };
        delete next[task.id];
        return next;
      });
    }
  };

  if (grouped === null) {
    return (
      <div className={styles.page}>
        <div className={styles.toolbar}>
          <FilterPills
            options={FILTER_OPTIONS}
            value={filter}
            onChange={setFilter}
          />
          <SortSelect value={sort} onChange={setSort} />
        </div>
        <Card padding="md">
          <SkeletonGroup count={5} />
        </Card>
      </div>
    );
  }

  return (
    <div className={styles.page}>
      <div className={styles.toolbar}>
        <FilterPills
          options={filterOptionsWithCounts}
          value={filter}
          onChange={setFilter}
          ariaLabel="Filter by due window"
        />
        <SortSelect value={sort} onChange={setSort} />
      </div>

      {grouped.length === 0 ? (
        <Card padding="none">
          <EmptyState
            icon={filter === "all" ? Inbox : ListChecks}
            title={
              filter === "all"
                ? "No tasks assigned to you"
                : "Nothing matches that filter"
            }
            description={
              filter === "all"
                ? "Once a task is assigned to you on any project, it'll show up here."
                : "Try a different filter to see what else is on your plate."
            }
          />
        </Card>
      ) : (
        <div className={styles.sections}>
          {grouped.map(({ project, tasks }) => (
            <ProjectSection
              key={project.id}
              project={project}
              tasks={tasks}
              collapsed={!!collapsed[project.id]}
              onToggle={() => handleToggleSection(project.id)}
              onMarkDone={handleMarkDone}
              pending={pending}
            />
          ))}
        </div>
      )}
    </div>
  );
}

// --- sort selector ---------------------------------------------------------

function SortSelect({ value, onChange }) {
  return (
    <label className={styles.sortWrap}>
      <span className={styles.sortLabel}>Sort</span>
      <select
        className={styles.sortSelect}
        value={value}
        onChange={(e) => onChange(e.target.value)}
      >
        {SORT_OPTIONS.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </label>
  );
}

// --- project section -------------------------------------------------------

function ProjectSection({
  project,
  tasks,
  collapsed,
  onToggle,
  onMarkDone,
  pending,
}) {
  const navigate = useNavigate();
  const open = !collapsed;
  return (
    <Card padding="none" className={styles.section}>
      <header className={styles.sectionHeader}>
        <button
          type="button"
          onClick={onToggle}
          className={styles.sectionToggle}
          aria-expanded={open}
        >
          <ChevronRight
            size={14}
            className={`${styles.chevron} ${open ? styles.chevronOpen : ""}`}
          />
          <span className={styles.sectionTitle}>{project.name}</span>
          <Badge status={project.status} dot size="sm">
            {project.status === "on-hold" ? "On hold" : project.status}
          </Badge>
          <span className={styles.sectionCount}>{tasks.length}</span>
        </button>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => navigate(`/project/${project.id}`)}
        >
          Open
        </Button>
      </header>
      {open && (
        <ul className={styles.taskList}>
          {tasks.map((t) => (
            <TaskRow
              key={t.id}
              task={t}
              onMarkDone={onMarkDone}
              pending={!!pending[t.id]}
            />
          ))}
        </ul>
      )}
    </Card>
  );
}

// --- task row --------------------------------------------------------------

function TaskRow({ task, onMarkDone, pending }) {
  const days = daysFromToday(task.due_date);
  const isOverdue = days !== null && days < 0;
  const isDone = task.status === "done";

  return (
    <li className={`${styles.taskRow} ${isDone ? styles.taskRowDone : ""}`}>
      <button
        type="button"
        className={`${styles.checkbox} ${isDone ? styles.checkboxChecked : ""}`}
        onClick={() => onMarkDone(task)}
        disabled={pending || isDone}
        aria-label={
          isDone ? "Task already done" : `Mark "${task.title}" as done`
        }
        title={
          isDone ? "Already done" : "Mark done"
        }
      >
        {isDone && <CircleCheck size={14} />}
      </button>
      <div className={styles.taskBody}>
        <span className={styles.taskTitle}>{task.title}</span>
        <span className={styles.taskMeta}>
          {task.status.replace(/-/g, " ")}
          {task.due_date && (
            <>
              <span className={styles.dotSep}>·</span>
              <span className={isOverdue ? styles.overdue : undefined}>
                {shortDate(task.due_date)} · {deadlinePhrase(task.due_date)}
              </span>
            </>
          )}
        </span>
      </div>
      <Badge
        variant={PRIORITY_TO_VARIANT[task.priority] ?? "neutral"}
        size="sm"
      >
        {task.priority}
      </Badge>
    </li>
  );
}

// --- helpers ---------------------------------------------------------------

function matchesFilter(task, filter) {
  if (filter === "all") return true;
  const days = daysFromToday(task.due_date);
  if (days === null) return false;
  switch (filter) {
    case "today":
      return days === 0 && task.status !== "done";
    case "week":
      return days >= 0 && days <= 7 && task.status !== "done";
    case "overdue":
      return days < 0 && task.status !== "done";
    default:
      return true;
  }
}

function compareTasks(a, b, sort) {
  switch (sort) {
    case "priority": {
      const pa = PRIORITY_RANK[a.priority] ?? 99;
      const pb = PRIORITY_RANK[b.priority] ?? 99;
      if (pa !== pb) return pa - pb;
      // Tie-break by due date so the higher-urgency item still surfaces.
      return compareTasks(a, b, "due");
    }
    case "project":
      return (a._project.name ?? "").localeCompare(b._project.name ?? "");
    case "due":
    default: {
      const da = daysFromToday(a.due_date);
      const db = daysFromToday(b.due_date);
      if (da === null && db === null) return 0;
      if (da === null) return 1;
      if (db === null) return -1;
      return da - db;
    }
  }
}
