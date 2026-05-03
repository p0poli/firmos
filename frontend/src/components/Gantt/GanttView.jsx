/**
 * GanttView — thin wrapper around `gantt-task-react`.
 *
 * Centralises:
 *   - the dark color palette (passed via the library's color props
 *     since the chart is rendered as SVG with inline fills)
 *   - the dark CSS overrides for chrome (in ganttDarkTheme.css)
 *   - dense default dimensions (rowHeight, headerHeight, columnWidth,
 *     listCellWidth) so the chart fits a normal viewport
 *   - the empty state when callers pass an empty task list
 */
import React from "react";
import { Gantt, ViewMode } from "gantt-task-react";
import "gantt-task-react/dist/index.css";
import "./ganttDarkTheme.css";
import { BarChart3 } from "lucide-react";
import { Card, EmptyState } from "../ui";
import styles from "./GanttView.module.css";

// Per-viewMode column widths chosen so a typical timeline fits the
// content area on a 1280px-wide desktop without horizontal scroll.
//   Day:   ~31 days * 36px  ≈ 1116px
//   Week:  ~13 weeks * 80px ≈ 1040px
//   Month: ~12 months * 120px = 1440px (will scroll on smaller viewports)
//   Year:   ~5 years * 200px = 1000px
const COLUMN_WIDTH_BY_MODE = {
  [ViewMode.Hour]: 24,
  [ViewMode.QuarterDay]: 32,
  [ViewMode.HalfDay]: 40,
  [ViewMode.Day]: 36,
  [ViewMode.Week]: 80,
  [ViewMode.Month]: 120,
  [ViewMode.Year]: 200,
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

// Compact default dimensions — half the library's defaults, roughly.
// Lower rowHeight means more rows fit before vertical scroll kicks in;
// the smaller header / list cell width gives bars more horizontal space.
const ROW_HEIGHT = 28;
const HEADER_HEIGHT = 40;
const LIST_CELL_WIDTH = "140px";

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
        rowHeight={ROW_HEIGHT}
        headerHeight={HEADER_HEIGHT}
        columnWidth={COLUMN_WIDTH_BY_MODE[viewMode] ?? 60}
        listCellWidth={showList ? LIST_CELL_WIDTH : ""}
        barCornerRadius={3}
        fontFamily="Inter, system-ui, sans-serif"
        fontSize="12"
        // colors
        {...THEME}
      />
    </div>
  );
}

export { ViewMode };
export default GanttView;
