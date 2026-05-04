/**
 * GanttChart — custom-built timeline component, no external Gantt lib.
 *
 * Layout (CSS sticky-table):
 *
 *   ┌──────────────┬──────────────────────────────────────┐
 *   │ corner (sticky│ calendar header (sticky top)          │
 *   │  top + left) │ ──────────────────────────────────── │
 *   │              │                                       │
 *   │ left panel   │ bars area                             │
 *   │ (sticky left)│ (horizontally scrollable)             │
 *   └──────────────┴──────────────────────────────────────┘
 *
 * The whole grid lives inside a single scroll container — it scrolls
 * both axes. `position: sticky` keeps the header and left panel in
 * place during the appropriate scroll direction. The page itself never
 * scrolls horizontally because the outer container is width: 100%.
 *
 * Data contract:
 *   rows = [
 *     { kind: "section", id, label, count? },         // section header
 *     { kind: "row",                                   // a bar row
 *       id, label,
 *       start: Date, end: Date,
 *       color: string,         // bar fill (hex/rgba)
 *       progress?: 0..100,     // optional progress overlay
 *       indent?: 0|1,          // visual indent in left panel
 *       avatar?: { name, email },
 *       expandable?: boolean,  // shows chevron in left panel
 *       expanded?: boolean,
 *       onToggle?: () => void,
 *       onClick?: () => void,  // click anywhere on the row
 *       meta?: string,         // e.g. "Assignee: Jane" for tooltip
 *     },
 *     ...
 *   ]
 *
 * viewMode = "week" | "month" | "quarter"  (default quarter)
 */
import React, { useMemo } from "react";
import {
  addDays,
  addMonths,
  addWeeks,
  differenceInMilliseconds,
  endOfMonth,
  endOfWeek,
  format,
  getISOWeek,
  isSameMonth,
  isSameYear,
  startOfDay,
  startOfMonth,
  startOfWeek,
} from "date-fns";
import { BarChart3, ChevronRight } from "lucide-react";
import { Avatar, Card, EmptyState } from "../ui";
import styles from "./GanttChart.module.css";

// --- view-mode config ------------------------------------------------------

const COL_WIDTH = {
  week: 60, // each column = 1 day
  month: 80, // each column = 1 week
  quarter: 120, // each column = 1 month
};

const ROW_HEIGHT = 36;
const HEADER_HEIGHT = 56; // two rows * 28px
const SECTION_HEIGHT = 32;
const LEFT_WIDTH = 220;
const MIN_BAR_WIDTH = 6;
// Padding around the auto-derived date range, so bars don't sit flush
// against the edges of the chart.
const RANGE_PAD = {
  week: { units: "days", n: 2 },
  month: { units: "weeks", n: 1 },
  quarter: { units: "months", n: 1 },
};

// --- public component ------------------------------------------------------

export function GanttChart({
  rows,
  viewMode = "quarter",
  emptyTitle = "Nothing on the timeline yet",
  emptyDescription = "Add start and end dates to populate the chart.",
}) {
  // Pull every dated row out so we can compute the chart range from data.
  const datedRows = useMemo(
    () =>
      (rows ?? []).filter(
        (r) =>
          r.kind === "row" &&
          r.start instanceof Date &&
          r.end instanceof Date &&
          !Number.isNaN(+r.start) &&
          !Number.isNaN(+r.end)
      ),
    [rows]
  );

  const dateRange = useMemo(() => {
    if (datedRows.length === 0) return null;
    const minMs = Math.min(...datedRows.map((r) => +r.start));
    const maxMs = Math.max(...datedRows.map((r) => +r.end));
    return clampRange(new Date(minMs), new Date(maxMs), viewMode);
  }, [datedRows, viewMode]);

  // Generate the column (minor) cells based on view mode.
  const columns = useMemo(() => {
    if (!dateRange) return [];
    return buildColumns(dateRange.start, dateRange.end, viewMode);
  }, [dateRange, viewMode]);

  // Group columns into the major header row (months, or years for the
  // quarter zoom).
  const headerGroups = useMemo(() => groupColumns(columns, viewMode), [
    columns,
    viewMode,
  ]);

  const colWidth = COL_WIDTH[viewMode];
  const timelineWidth = columns.length * colWidth;

  const dateToX = useMemo(() => {
    if (!dateRange) return () => 0;
    const totalMs = differenceInMilliseconds(dateRange.end, dateRange.start);
    return (d) => {
      if (!d || Number.isNaN(+d)) return 0;
      const off = +d - +dateRange.start;
      return Math.max(0, Math.min(timelineWidth, (off / totalMs) * timelineWidth));
    };
  }, [dateRange, timelineWidth]);

  if (!rows || rows.length === 0 || !dateRange) {
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

  const todayX = dateToX(startOfDay(new Date()));
  const todayInRange =
    new Date() >= dateRange.start && new Date() <= dateRange.end;

  // Total body height for the today line.
  const bodyHeight = rows.reduce(
    (h, r) => h + (r.kind === "section" ? SECTION_HEIGHT : ROW_HEIGHT),
    0
  );

  return (
    <div className={styles.shell}>
      <div
        className={styles.scroll}
        style={{ "--col-width": `${colWidth}px` }}
      >
        <div
          className={styles.inner}
          style={{
            width: LEFT_WIDTH + timelineWidth,
          }}
        >
          {/* --- header row (sticky top) --------------------------- */}
          <div
            className={styles.headerRow}
            style={{ height: HEADER_HEIGHT }}
          >
            <div className={styles.cornerCell} style={{ width: LEFT_WIDTH }}>
              <span className={styles.cornerLabel}>
                {viewMode === "week"
                  ? "Days"
                  : viewMode === "month"
                  ? "Weeks"
                  : "Months"}
              </span>
            </div>

            <div
              className={styles.calHeader}
              style={{ width: timelineWidth }}
            >
              <div className={styles.calTopRow}>
                {headerGroups.map((g) => (
                  <div
                    key={g.key}
                    className={styles.calTopCell}
                    style={{ width: g.width }}
                  >
                    {g.label}
                  </div>
                ))}
              </div>
              <div className={styles.calBottomRow}>
                {columns.map((c) => (
                  <div
                    key={c.key}
                    className={`${styles.calBottomCell} ${
                      c.isToday ? styles.calBottomToday : ""
                    }`}
                    style={{ width: colWidth }}
                  >
                    {c.label}
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* --- today line ---------------------------------------- */}
          {todayInRange && (
            <div
              className={styles.todayLine}
              style={{
                left: LEFT_WIDTH + todayX,
                top: HEADER_HEIGHT,
                height: bodyHeight,
              }}
              aria-hidden="true"
            />
          )}

          {/* --- body rows ----------------------------------------- */}
          {rows.map((row, i) => {
            if (row.kind === "section") {
              return (
                <SectionRow
                  key={row.id}
                  row={row}
                  width={LEFT_WIDTH + timelineWidth}
                />
              );
            }
            const left = dateToX(row.start);
            const right = dateToX(row.end);
            const width = Math.max(right - left, MIN_BAR_WIDTH);
            return (
              <BodyRow
                key={row.id}
                row={row}
                index={i}
                left={left}
                width={width}
                timelineWidth={timelineWidth}
              />
            );
          })}
        </div>
      </div>
    </div>
  );
}

// --- section header row ----------------------------------------------------

function SectionRow({ row, width }) {
  return (
    <div
      className={styles.sectionRow}
      style={{ height: SECTION_HEIGHT, width }}
    >
      <div
        className={styles.sectionLeft}
        style={{ width: LEFT_WIDTH }}
      >
        <span className={styles.sectionLabel}>{row.label}</span>
        {typeof row.count === "number" && (
          <span className={styles.sectionCount}>{row.count}</span>
        )}
      </div>
      <div className={styles.sectionRight} />
    </div>
  );
}

// --- body row (left cell + bars cell) --------------------------------------

function BodyRow({ row, index, left, width, timelineWidth }) {
  const handleRowClick = () => {
    if (row.onClick) row.onClick(row);
  };

  return (
    <div
      className={`${styles.bodyRow} ${
        index % 2 === 0 ? styles.even : styles.odd
      } ${row.onClick ? styles.clickable : ""}`}
      style={{ height: ROW_HEIGHT }}
      onClick={handleRowClick}
    >
      <div
        className={`${styles.leftCell} ${row.indent ? styles.indented : ""}`}
        style={{ width: LEFT_WIDTH }}
      >
        {row.expandable !== undefined && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              row.onToggle?.();
            }}
            className={`${styles.expandBtn} ${
              !row.expandable ? styles.expandBtnHidden : ""
            }`}
            aria-label={row.expanded ? "Collapse" : "Expand"}
          >
            <ChevronRight
              size={12}
              className={`${styles.chevron} ${
                row.expanded ? styles.chevronOpen : ""
              }`}
            />
          </button>
        )}

        <span
          className={styles.colorDot}
          style={{ backgroundColor: row.color }}
          aria-hidden="true"
        />
        <span className={styles.rowLabel} title={row.label}>
          {row.label}
        </span>
        {row.avatar && (
          <Avatar
            name={row.avatar.name}
            email={row.avatar.email}
            size="sm"
          />
        )}
      </div>

      <div
        className={styles.barsCell}
        style={{ width: timelineWidth }}
      >
        <div
          className={styles.bar}
          style={{
            left,
            width,
            backgroundColor: row.color,
          }}
        >
          {row.progress !== undefined && row.progress > 0 && (
            <div
              className={styles.barProgress}
              style={{ width: `${Math.min(100, row.progress)}%` }}
            />
          )}
          <span className={styles.barLabel}>{row.label}</span>

          {/* Hover tooltip — pure CSS, anchored above the bar. */}
          <div className={styles.tooltip} role="tooltip">
            <div className={styles.tooltipTitle}>{row.label}</div>
            <div className={styles.tooltipRow}>
              <span className={styles.tooltipKey}>Start</span>
              <span>{format(row.start, "d MMM yyyy")}</span>
            </div>
            <div className={styles.tooltipRow}>
              <span className={styles.tooltipKey}>End</span>
              <span>{format(row.end, "d MMM yyyy")}</span>
            </div>
            {row.avatar && (
              <div className={styles.tooltipRow}>
                <span className={styles.tooltipKey}>Assigned</span>
                <span>{row.avatar.name}</span>
              </div>
            )}
            {row.meta && (
              <div className={styles.tooltipRow}>
                <span>{row.meta}</span>
              </div>
            )}
          </div>
        </div>

        {/* Label that overflows past the bar's right edge — only shows
            when the bar is too narrow for the inline label. */}
        <span
          className={styles.barLabelOverflow}
          style={{ left: left + width + 6 }}
        >
          {row.label}
        </span>
      </div>
    </div>
  );
}

// --- date math helpers -----------------------------------------------------

function clampRange(min, max, viewMode) {
  // Snap range start to the start of the period and add padding.
  let start;
  let end;
  switch (viewMode) {
    case "week":
      start = startOfDay(addDays(min, -RANGE_PAD.week.n));
      end = startOfDay(addDays(max, RANGE_PAD.week.n + 1));
      break;
    case "month":
      start = startOfWeek(addWeeks(min, -RANGE_PAD.month.n), {
        weekStartsOn: 1,
      });
      end = endOfWeek(addWeeks(max, RANGE_PAD.month.n), { weekStartsOn: 1 });
      break;
    case "quarter":
    default:
      start = startOfMonth(addMonths(min, -RANGE_PAD.quarter.n));
      end = endOfMonth(addMonths(max, RANGE_PAD.quarter.n));
      break;
  }
  return { start, end };
}

function buildColumns(start, end, viewMode) {
  const today = startOfDay(new Date());
  const cols = [];
  let cursor = start;
  switch (viewMode) {
    case "week":
      while (cursor < end) {
        const next = addDays(cursor, 1);
        cols.push({
          key: cursor.toISOString(),
          start: cursor,
          end: next,
          label: format(cursor, "d"),
          isToday: +startOfDay(cursor) === +today,
        });
        cursor = next;
      }
      break;
    case "month":
      cursor = startOfWeek(start, { weekStartsOn: 1 });
      while (cursor < end) {
        const next = addWeeks(cursor, 1);
        cols.push({
          key: cursor.toISOString(),
          start: cursor,
          end: next,
          label: `W${getISOWeek(cursor)}`,
          isToday: today >= cursor && today < next,
        });
        cursor = next;
      }
      break;
    case "quarter":
    default:
      cursor = startOfMonth(start);
      while (cursor < end) {
        const next = addMonths(cursor, 1);
        cols.push({
          key: cursor.toISOString(),
          start: cursor,
          end: next,
          label: format(cursor, "MMM"),
          isToday: today >= cursor && today < next,
        });
        cursor = next;
      }
      break;
  }
  return cols;
}

function groupColumns(columns, viewMode) {
  // Major header row: month name (week/month zoom) or year (quarter zoom).
  const groups = [];
  for (const col of columns) {
    const lastGroup = groups[groups.length - 1];

    let key;
    let label;
    if (viewMode === "quarter") {
      key = `${col.start.getFullYear()}`;
      label = key;
    } else {
      key = format(col.start, "yyyy-MM");
      label = format(col.start, "MMM yyyy");
    }

    if (lastGroup && lastGroup.key === key) {
      lastGroup.cols += 1;
    } else {
      groups.push({ key, label, cols: 1 });
    }
  }
  // Compute pixel widths from column count once we're done grouping.
  const colWidth = COL_WIDTH[viewMode];
  for (const g of groups) {
    g.width = g.cols * colWidth;
  }
  return groups;
}

// Re-export so the lib stays available without a separate index.js.
export default GanttChart;
