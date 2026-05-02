/**
 * GanttView — thin wrapper around `gantt-task-react`.
 *
 * Centralises:
 *   - the dark-theme color palette (passed via the library's color props
 *     since the chart is rendered as SVG with inline fills)
 *   - the dark-theme CSS overrides for the surrounding chrome
 *   - the empty-state when callers pass an empty task list
 *   - viewMode → columnWidth defaults so the chart breathes correctly
 *
 * Both the firm-wide /gantt page and the per-project Gantt tab inside
 * ProjectDetail render through this single component.
 */
import React from "react";
import { Gantt, ViewMode } from "gantt-task-react";
import "gantt-task-react/dist/index.css";
import "./ganttDarkTheme.css";
import { BarChart3 } from "lucide-react";
import { Card, EmptyState } from "../ui";
import styles from "./GanttView.module.css";

// Per-viewMode column widths chosen so a typical timeline fits on screen
// without horizontal scroll for short projects.
const COLUMN_WIDTH_BY_MODE = {
  [ViewMode.Hour]: 30,
  [ViewMode.QuarterDay]: 40,
  [ViewMode.HalfDay]: 50,
  [ViewMode.Day]: 56,
  [ViewMode.Week]: 250,
  [ViewMode.Month]: 240,
  [ViewMode.Year]: 320,
};

// Token-driven theme that we pass as props to <Gantt /> — the library
// uses inline fills for bars and grid, so prop-based theming is the
// only way to colorise those.
const THEME = {
  // bars rendered for type === "task"
  barProgressColor: "#5865f2",
  barProgressSelectedColor: "#7882ff",
  barBackgroundColor: "rgba(82, 82, 91, 0.55)",
  barBackgroundSelectedColor: "rgba(82, 82, 91, 0.8)",
  // bars rendered for type === "project" (parent groups in breakdown view)
  projectProgressColor: "#5865f2",
  projectProgressSelectedColor: "#7882ff",
  projectBackgroundColor: "rgba(88, 101, 242, 0.35)",
  projectBackgroundSelectedColor: "rgba(88, 101, 242, 0.55)",
  milestoneBackgroundColor: "#22c55e",
  milestoneBackgroundSelectedColor: "#34d39c",
  arrowColor: "#5865f2",
  todayColor: "rgba(88, 101, 242, 0.18)",
};

export function GanttView({
  tasks,
  viewMode = ViewMode.Month,
  viewDate,
  onClick,
  showList = true,
  emptyTitle = "Nothing on the timeline yet",
  emptyDescription = "Set start and deadline dates on your projects to see them here.",
}) {
  if (!tasks || tasks.length === 0) {
    return (
      <Card padding="none">
        <EmptyState
          icon={BarChart3}
          title={emptyTitle}
          description={emptyDescription}
        />
      </Card>
    );
  }

  return (
    <div className={`firmos-gantt ${styles.wrap}`}>
      <Gantt
        tasks={tasks}
        viewMode={viewMode}
        viewDate={viewDate}
        onClick={onClick}
        // chrome
        rowHeight={36}
        headerHeight={48}
        columnWidth={COLUMN_WIDTH_BY_MODE[viewMode] ?? 60}
        listCellWidth={showList ? "240px" : ""}
        barCornerRadius={3}
        fontFamily="Inter, sans-serif"
        fontSize="13"
        // colors
        {...THEME}
      />
    </div>
  );
}

export { ViewMode };
export default GanttView;
