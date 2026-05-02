/**
 * Gantt — firm-wide timeline of every project, optionally with each
 * project's tasks expanded as sub-bars.
 *
 * Two toggles drive the view:
 *   - View range: This month | This quarter | This year
 *     Maps to gantt-task-react's ViewMode (Day / Week / Month) plus a
 *     viewDate that anchors the chart at the current period's start.
 *   - Breakdown:  Projects only | Full breakdown
 *     In "Full breakdown" each project becomes a parent group with its
 *     tasks rendered as sub-bars under it.
 *
 * Every project that has both a start_date and a deadline is included.
 * Tasks have no start_date in the schema, so we synthesize a 7-day
 * window ending at due_date — the page surface explains this.
 *
 * Click a bar -> opens a side panel with the underlying record's
 * details. Local React state, no routing change.
 */
import React, { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  ExternalLink,
  Info,
  Layers,
  X,
} from "lucide-react";
import {
  Badge,
  Button,
  Card,
  FilterPills,
  Skeleton,
} from "../components/ui";
import { GanttView, ViewMode } from "../components/Gantt";
import { getProjectTasks, listProjects } from "../api";
import { shortDate } from "../lib/dates";
import styles from "./Gantt.module.css";

// --- view-range presets -----------------------------------------------------

const RANGE_PRESETS = {
  month: { label: "This month", viewMode: ViewMode.Day },
  quarter: { label: "This quarter", viewMode: ViewMode.Week },
  year: { label: "This year", viewMode: ViewMode.Month },
};

// Anchor date for the chart's left edge based on the chosen preset.
function rangeAnchor(range) {
  const now = new Date();
  switch (range) {
    case "month":
      return new Date(now.getFullYear(), now.getMonth(), 1);
    case "quarter": {
      const q = Math.floor(now.getMonth() / 3) * 3;
      return new Date(now.getFullYear(), q, 1);
    }
    case "year":
      return new Date(now.getFullYear(), 0, 1);
    default:
      return now;
  }
}

const STATUS_BAR_COLOR = {
  active: { bar: "rgba(88, 101, 242, 0.55)", progress: "#5865f2" },
  "on-hold": { bar: "rgba(245, 158, 11, 0.45)", progress: "#f59e0b" },
  completed: { bar: "rgba(34, 197, 94, 0.45)", progress: "#22c55e" },
  archived: { bar: "rgba(82, 82, 91, 0.5)", progress: "#a1a1aa" },
};

const PRIORITY_BAR_COLOR = {
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

// --- page ------------------------------------------------------------------

export default function Gantt() {
  const [projects, setProjects] = useState(null);
  const [tasksByProject, setTasksByProject] = useState({});
  const [range, setRange] = useState("quarter");
  const [breakdown, setBreakdown] = useState(false);
  const [selected, setSelected] = useState(null); // { kind: "project" | "task", record }

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

  const ganttTasks = useMemo(() => {
    if (!projects) return null;
    const items = [];
    for (const p of projects) {
      if (!p.start_date || !p.deadline) continue;
      const start = new Date(p.start_date);
      const end = new Date(p.deadline);
      // Clamp end to never be before start; gantt-task-react crashes
      // otherwise.
      if (end < start) end.setTime(start.getTime() + 24 * 3600 * 1000);

      const projectTasks = tasksByProject[p.id] ?? [];
      const total = projectTasks.length;
      const done = projectTasks.filter((t) => t.status === "done").length;
      const progress = total > 0 ? Math.round((done / total) * 100) : 0;
      const palette =
        STATUS_BAR_COLOR[p.status] ?? STATUS_BAR_COLOR.archived;

      items.push({
        id: `proj-${p.id}`,
        name: p.name,
        start,
        end,
        type: breakdown ? "project" : "task",
        progress,
        styles: {
          backgroundColor: palette.bar,
          backgroundSelectedColor: palette.bar,
          progressColor: palette.progress,
          progressSelectedColor: palette.progress,
        },
        // Stash the raw record on the bar so onClick can recover it.
        _record: { kind: "project", project: p },
      });

      if (breakdown) {
        for (const t of projectTasks) {
          if (!t.due_date) continue;
          const due = new Date(t.due_date);
          const taskStart = new Date(due);
          taskStart.setDate(
            taskStart.getDate() - SYNTHETIC_TASK_DURATION_DAYS
          );
          const colour = PRIORITY_BAR_COLOR[t.priority] ?? "#a1a1aa";
          items.push({
            id: `task-${t.id}`,
            name: t.title,
            start: taskStart,
            end: due,
            type: "task",
            progress: TASK_STATUS_PROGRESS[t.status] ?? 0,
            project: `proj-${p.id}`,
            styles: {
              backgroundColor: colour + "55", // 33% alpha
              backgroundSelectedColor: colour + "88",
              progressColor: colour,
              progressSelectedColor: colour,
            },
            _record: { kind: "task", task: t, project: p },
          });
        }
      }
    }
    return items;
  }, [projects, tasksByProject, breakdown]);

  const projectsWithoutDates = useMemo(() => {
    if (!projects) return 0;
    return projects.filter((p) => !p.start_date || !p.deadline).length;
  }, [projects]);

  const handleClick = (taskBar) => {
    if (taskBar?._record) {
      setSelected(taskBar._record);
    }
  };

  const rangePreset = RANGE_PRESETS[range];

  return (
    <div className={styles.page}>
      <div className={styles.toolbar}>
        <div className={styles.toolbarGroup}>
          <span className={styles.toolbarLabel}>Range</span>
          <FilterPills
            options={Object.entries(RANGE_PRESETS).map(([value, { label }]) => ({
              value,
              label,
            }))}
            value={range}
            onChange={setRange}
            ariaLabel="Date range"
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

      {ganttTasks === null ? (
        <Card padding="md">
          <Skeleton width="100%" height={420} />
        </Card>
      ) : (
        <GanttView
          tasks={ganttTasks}
          viewMode={rangePreset.viewMode}
          viewDate={rangeAnchor(range)}
          onClick={handleClick}
          emptyTitle="No projects on the timeline"
          emptyDescription="Add a start date and deadline to a project, or switch to the full breakdown view."
        />
      )}

      {selected && (
        <DetailPanel
          selection={selected}
          onClose={() => setSelected(null)}
        />
      )}
    </div>
  );
}

// --- side panel ------------------------------------------------------------

function DetailPanel({ selection, onClose }) {
  const navigate = useNavigate();
  const { kind } = selection;

  return (
    <>
      <div className={styles.scrim} onClick={onClose} aria-hidden="true" />
      <aside
        className={styles.panel}
        role="dialog"
        aria-label={kind === "project" ? "Project detail" : "Task detail"}
      >
        <header className={styles.panelHeader}>
          <span className={styles.panelKind}>
            {kind === "project" ? "Project" : "Task"}
          </span>
          <Button variant="icon" size="sm" onClick={onClose} aria-label="Close">
            <X size={16} />
          </Button>
        </header>

        {kind === "project" ? (
          <ProjectPanelBody project={selection.project} navigate={navigate} />
        ) : (
          <TaskPanelBody
            task={selection.task}
            project={selection.project}
            navigate={navigate}
          />
        )}
      </aside>
    </>
  );
}

function ProjectPanelBody({ project, navigate }) {
  return (
    <div className={styles.panelBody}>
      <h2 className={styles.panelTitle}>{project.name}</h2>
      <div className={styles.panelMeta}>
        <Badge status={project.status} dot size="sm">
          {project.status === "on-hold" ? "On hold" : project.status}
        </Badge>
      </div>
      {project.description && (
        <p className={styles.panelDescription}>{project.description}</p>
      )}
      <dl className={styles.panelKv}>
        <div>
          <dt>Start</dt>
          <dd>{project.start_date ? shortDate(project.start_date) : "—"}</dd>
        </div>
        <div>
          <dt>Deadline</dt>
          <dd>{project.deadline ? shortDate(project.deadline) : "—"}</dd>
        </div>
        <div>
          <dt>Members</dt>
          <dd>{project.members?.length ?? 0}</dd>
        </div>
      </dl>
      <Button
        variant="primary"
        size="md"
        leadingIcon={<ExternalLink size={14} />}
        onClick={() => navigate(`/project/${project.id}`)}
      >
        Open project
      </Button>
    </div>
  );
}

function TaskPanelBody({ task, project, navigate }) {
  return (
    <div className={styles.panelBody}>
      <h2 className={styles.panelTitle}>{task.title}</h2>
      <div className={styles.panelMeta}>
        <Badge status={task.status} dot size="sm">
          {task.status.replace(/-/g, " ")}
        </Badge>
        <Badge
          variant={
            task.priority === "high"
              ? "danger"
              : task.priority === "medium"
              ? "warning"
              : "neutral"
          }
          size="sm"
        >
          {task.priority}
        </Badge>
      </div>
      {task.description && (
        <p className={styles.panelDescription}>{task.description}</p>
      )}
      <dl className={styles.panelKv}>
        <div>
          <dt>Project</dt>
          <dd>{project.name}</dd>
        </div>
        <div>
          <dt>Due</dt>
          <dd>{task.due_date ? shortDate(task.due_date) : "—"}</dd>
        </div>
      </dl>
      <Button
        variant="secondary"
        size="md"
        leadingIcon={<ExternalLink size={14} />}
        onClick={() => navigate(`/project/${project.id}?tab=tasks`)}
      >
        Open in project
      </Button>
    </div>
  );
}
