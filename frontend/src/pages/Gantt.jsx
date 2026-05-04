/**
 * Gantt — firm-wide timeline.
 *
 * Each project with both a start_date and a deadline becomes a row in
 * the chart. In Full breakdown mode, rows expand to reveal their tasks
 * as indented sub-rows underneath; expand state is per-project, kept
 * in local React state.
 *
 * Bars: project rows are colored by status, task sub-rows by priority.
 * Click any project row to navigate to its detail page.
 */
import React, { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Info, Layers } from "lucide-react";
import { Card, FilterPills, Skeleton } from "../components/ui";
import { GanttChart } from "../components/Gantt";
import { getProjectTasks, listProjects } from "../api";
import styles from "./Gantt.module.css";

const STATUS_COLOR = {
  active: "#5865f2",
  "on-hold": "#f59e0b",
  completed: "#22c55e",
  archived: "#71717a",
};

const PRIORITY_COLOR = {
  high: "#ef4444",
  medium: "#f59e0b",
  low: "#5865f2",
};

const TASK_STATUS_PROGRESS = {
  todo: 0,
  "in-progress": 50,
  review: 75,
  done: 100,
};

const SYNTHETIC_TASK_DURATION_DAYS = 7;

const VIEW_OPTIONS = [
  { value: "week", label: "Week" },
  { value: "month", label: "Month" },
  { value: "quarter", label: "Quarter" },
];

// --- page ------------------------------------------------------------------

export default function Gantt() {
  const navigate = useNavigate();
  const [projects, setProjects] = useState(null);
  const [tasksByProject, setTasksByProject] = useState({});
  const [viewMode, setViewMode] = useState("quarter");
  const [breakdown, setBreakdown] = useState(false);
  const [expanded, setExpanded] = useState({}); // { [projectId]: true }

  useEffect(() => {
    let cancelled = false;
    listProjects()
      .then((rows) => !cancelled && setProjects(rows))
      .catch(() => !cancelled && setProjects([]));
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

  // Build the GanttChart `rows` prop. In breakdown mode we walk through
  // every project and conditionally append its tasks if the project is
  // expanded.
  const rows = useMemo(() => {
    if (!projects) return null;
    const out = [];
    for (const p of projects) {
      if (!p.start_date || !p.deadline) continue;
      const projectTasks = tasksByProject[p.id] ?? [];
      const total = projectTasks.length;
      const done = projectTasks.filter((t) => t.status === "done").length;
      const isExpanded = !!expanded[p.id];

      out.push({
        kind: "row",
        id: `proj-${p.id}`,
        label: p.name,
        start: new Date(p.start_date),
        end: new Date(p.deadline),
        color: STATUS_COLOR[p.status] ?? STATUS_COLOR.archived,
        progress: total > 0 ? Math.round((done / total) * 100) : 0,
        expandable: breakdown,
        expanded: isExpanded,
        onToggle: () =>
          setExpanded((prev) => ({ ...prev, [p.id]: !prev[p.id] })),
        onClick: () => navigate(`/project/${p.id}`),
        meta: `${total} ${total === 1 ? "task" : "tasks"} · ${done} done`,
      });

      if (breakdown && isExpanded) {
        for (const t of projectTasks) {
          if (!t.due_date) continue;
          const end = new Date(t.due_date);
          const start = new Date(end);
          start.setDate(start.getDate() - SYNTHETIC_TASK_DURATION_DAYS);
          // Look up assignee from the project's member list.
          const assignee = (p.members ?? []).find(
            (m) => m.id === t.assigned_user_id
          );
          out.push({
            kind: "row",
            id: `task-${t.id}`,
            label: t.title,
            start,
            end,
            color: PRIORITY_COLOR[t.priority] ?? PRIORITY_COLOR.low,
            progress: TASK_STATUS_PROGRESS[t.status] ?? 0,
            indent: 1,
            avatar: assignee
              ? { name: assignee.name, email: assignee.email }
              : null,
            onClick: () => navigate(`/project/${p.id}?tab=tasks`),
          });
        }
      }
    }
    return out;
  }, [projects, tasksByProject, breakdown, expanded, navigate]);

  const projectsWithoutDates = useMemo(() => {
    if (!projects) return 0;
    return projects.filter((p) => !p.start_date || !p.deadline).length;
  }, [projects]);

  return (
    <div className={styles.page}>
      <div className={styles.toolbar}>
        <div className={styles.toolbarGroup}>
          <span className={styles.toolbarLabel}>Zoom</span>
          <FilterPills
            options={VIEW_OPTIONS}
            value={viewMode}
            onChange={setViewMode}
            ariaLabel="Zoom level"
          />
        </div>
        <div className={styles.toolbarGroup}>
          <span className={styles.toolbarLabel}>View</span>
          <FilterPills
            options={[
              { value: false, label: "Projects only" },
              { value: true, label: "Full breakdown" },
            ]}
            value={breakdown}
            onChange={setBreakdown}
            ariaLabel="Breakdown level"
          />
        </div>
      </div>

      {projectsWithoutDates > 0 && (
        <Card className={styles.note}>
          <Info size={14} />
          <span>
            {projectsWithoutDates}{" "}
            {projectsWithoutDates === 1 ? "project is" : "projects are"}{" "}
            missing a start date or deadline and{" "}
            {projectsWithoutDates === 1 ? "isn't" : "aren't"} on the
            timeline.
          </span>
        </Card>
      )}

      {breakdown && (
        <Card className={styles.note}>
          <Layers size={14} />
          <span>
            Tasks don't store a start date today, so each one is shown as
            a {SYNTHETIC_TASK_DURATION_DAYS}-day window ending at its due
            date.
          </span>
        </Card>
      )}

      {rows === null ? (
        <Card padding="md">
          <Skeleton width="100%" height={420} />
        </Card>
      ) : (
        <GanttChart
          rows={rows}
          viewMode={viewMode}
          emptyTitle="No projects on the timeline"
          emptyDescription="Add a start date and deadline to a project to see it here."
        />
      )}
    </div>
  );
}
