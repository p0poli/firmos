/**
 * Portfolio — every project at a glance, filterable by status.
 *
 * The page fires two parallel batches like the Dashboard:
 *   1. listProjects() — all statuses, returns members embedded.
 *   2. getProjectTasks(p.id) for each project — feeds the labelled
 *      progress bar plus the task-status breakdown pills.
 *
 * Filter is purely client-side (we already fetched everything once),
 * so flipping pills is instant and the counts stay accurate.
 */
import React, { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { FolderOpen } from "lucide-react";
import {
  AvatarStack,
  Badge,
  Card,
  EmptyState,
  FilterPills,
  ProgressBar,
  Skeleton,
} from "../components/ui";
import { getProjectTasks, listProjects } from "../api";
import { daysFromToday, deadlinePhrase, shortDate } from "../lib/dates";
import styles from "./Portfolio.module.css";

const STATUS_ORDER = ["active", "on-hold", "completed", "archived"];

const STATUS_ACCENT = {
  active: "var(--color-primary)",
  "on-hold": "var(--color-warning)",
  completed: "var(--color-success)",
  archived: "var(--color-text-muted)",
};

const TASK_STATUS_LABEL = {
  todo: "todo",
  "in-progress": "in progress",
  review: "review",
  done: "done",
};

const TASK_STATUS_VARIANT = {
  todo: "neutral",
  "in-progress": "primary",
  review: "warning",
  done: "success",
};

// --- page ------------------------------------------------------------------

export default function Portfolio() {
  const [projects, setProjects] = useState(null);
  const [tasksByProject, setTasksByProject] = useState({});
  const [filter, setFilter] = useState(null); // null === "All"

  useEffect(() => {
    let cancelled = false;
    listProjects()
      .then((rows) => {
        if (!cancelled) setProjects(rows);
      })
      .catch(() => {
        if (!cancelled) setProjects([]);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // Fan out task fetches once projects are known.
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

  // Counts per status for the pill chips.
  const counts = useMemo(() => {
    const map = { all: 0, active: 0, "on-hold": 0, completed: 0, archived: 0 };
    if (!projects) return map;
    map.all = projects.length;
    for (const p of projects) {
      if (map[p.status] !== undefined) map[p.status] += 1;
    }
    return map;
  }, [projects]);

  const filterOptions = [
    { value: null, label: "All", count: counts.all },
    ...STATUS_ORDER.map((s) => ({
      value: s,
      label:
        s === "on-hold"
          ? "On hold"
          : s.charAt(0).toUpperCase() + s.slice(1),
      count: counts[s],
    })),
  ];

  const filteredProjects = useMemo(() => {
    if (!projects) return null;
    if (filter === null) return projects;
    return projects.filter((p) => p.status === filter);
  }, [projects, filter]);

  return (
    <div className={styles.page}>
      <div className={styles.toolbar}>
        <FilterPills
          options={filterOptions}
          value={filter}
          onChange={setFilter}
          ariaLabel="Filter projects by status"
        />
      </div>

      <Body
        projects={filteredProjects}
        tasksByProject={tasksByProject}
        filterLabel={filter ? filterOptions.find((o) => o.value === filter)?.label : null}
      />
    </div>
  );
}

// --- subcomponents ---------------------------------------------------------

function Body({ projects, tasksByProject, filterLabel }) {
  if (projects === null) {
    return (
      <div className={styles.grid}>
        {[0, 1, 2, 3, 4, 5].map((i) => (
          <ProjectCardSkeleton key={i} />
        ))}
      </div>
    );
  }
  if (projects.length === 0) {
    return (
      <Card padding="none">
        <EmptyState
          icon={FolderOpen}
          title={
            filterLabel
              ? `No ${filterLabel.toLowerCase()} projects`
              : "No projects yet"
          }
          description={
            filterLabel
              ? "Try a different filter, or change a project's status from its detail page."
              : "Create your first project from the API to populate the portfolio."
          }
        />
      </Card>
    );
  }
  return (
    <div className={styles.grid}>
      {projects.map((p) => (
        <ProjectCard
          key={p.id}
          project={p}
          tasks={tasksByProject[p.id]}
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

  // Per-status breakdown for the pill row.
  const breakdown = useMemo(() => {
    if (!tasksLoaded) return null;
    const acc = { todo: 0, "in-progress": 0, review: 0, done: 0 };
    for (const t of tasks) {
      if (acc[t.status] !== undefined) acc[t.status] += 1;
    }
    return acc;
  }, [tasks, tasksLoaded]);

  const days = daysFromToday(project.deadline);
  const deadlineUrgent = days !== null && days >= 0 && days < 7;
  const deadlineOverdue = days !== null && days < 0;

  return (
    <Card
      interactive
      padding="none"
      className={styles.card}
      onClick={() => navigate(`/project/${project.id}`)}
    >
      <span
        className={styles.accent}
        style={{ backgroundColor: STATUS_ACCENT[project.status] ?? "var(--color-text-muted)" }}
        aria-hidden="true"
      />
      <div className={styles.cardBody}>
        <header className={styles.cardHeader}>
          <h3 className={styles.cardTitle} title={project.name}>
            {project.name}
          </h3>
          <Badge status={project.status} dot size="sm">
            {project.status === "on-hold" ? "On hold" : project.status}
          </Badge>
        </header>

        {project.description && (
          <p className={styles.cardDescription}>{project.description}</p>
        )}

        {tasksLoaded ? (
          <ProgressBar
            value={done}
            max={Math.max(total, 1)}
            intent={total > 0 && done === total ? "success" : "primary"}
            showLabel
            label={total === 0 ? "No tasks yet" : `${done} of ${total} tasks`}
          />
        ) : (
          <Skeleton width="100%" height={4} />
        )}

        <div className={styles.deadlineRow}>
          {project.deadline ? (
            <span
              className={
                deadlineOverdue
                  ? styles.deadlineOverdue
                  : deadlineUrgent
                  ? styles.deadlineUrgent
                  : styles.deadline
              }
            >
              <span className={styles.deadlineDate}>
                {shortDate(project.deadline)}
              </span>
              <span className={styles.deadlineRel}>
                {deadlinePhrase(project.deadline)}
              </span>
            </span>
          ) : (
            <span className={styles.deadlineMuted}>No deadline</span>
          )}
        </div>

        <div className={styles.footer}>
          <AvatarStack users={project.members ?? []} max={3} size="sm" />
          {breakdown && total > 0 ? (
            <div className={styles.breakdown}>
              {Object.entries(breakdown)
                .filter(([, n]) => n > 0)
                .map(([status, n]) => (
                  <Badge
                    key={status}
                    variant={TASK_STATUS_VARIANT[status]}
                    size="sm"
                  >
                    {n} {TASK_STATUS_LABEL[status]}
                  </Badge>
                ))}
            </div>
          ) : (
            tasksLoaded && (
              <span className={styles.breakdownEmpty}>
                {total === 0 ? "—" : ""}
              </span>
            )
          )}
        </div>
      </div>
    </Card>
  );
}

function ProjectCardSkeleton() {
  return (
    <div className={styles.cardSkeleton}>
      <span className={styles.accentSkeleton} aria-hidden="true" />
      <div className={styles.cardBody}>
        <Skeleton width="60%" height={20} />
        <Skeleton width="100%" height={14} />
        <Skeleton width="85%" height={14} />
        <Skeleton width="100%" height={4} />
        <Skeleton width="40%" height={14} />
      </div>
    </div>
  );
}
