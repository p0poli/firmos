/**
 * Date helpers used across the redesigned pages.
 *
 * Wraps date-fns so callers don't repeat the same imports + null-checks.
 * All functions tolerate `null`/`undefined`/invalid inputs and return a
 * sensible fallback string ("—") so the UI never shows "Invalid Date".
 */
import {
  differenceInCalendarDays,
  format,
  formatDistanceToNow,
  isValid,
  parseISO,
} from "date-fns";

const FALLBACK = "—";

function toDate(input) {
  if (!input) return null;
  if (input instanceof Date) return isValid(input) ? input : null;
  // date-fns parseISO handles "2026-05-02" and "2026-05-02T12:34:56" but
  // not naked numeric timestamps; the API returns ISO strings everywhere.
  const d = typeof input === "string" ? parseISO(input) : new Date(input);
  return isValid(d) ? d : null;
}

/** "5 days ago", "in 2 hours", etc. */
export function relativeTime(input) {
  const d = toDate(input);
  if (!d) return FALLBACK;
  return formatDistanceToNow(d, { addSuffix: true });
}

/** "2 May", "12 Jan 2027" — falls back to year if not the current year. */
export function shortDate(input) {
  const d = toDate(input);
  if (!d) return FALLBACK;
  const sameYear = d.getFullYear() === new Date().getFullYear();
  return format(d, sameYear ? "d MMM" : "d MMM yyyy");
}

/** Days from today to the given date — negative if past. */
export function daysFromToday(input) {
  const d = toDate(input);
  if (!d) return null;
  return differenceInCalendarDays(d, new Date());
}

/**
 * Friendly deadline phrase: "in 5 days", "today", "1 day overdue".
 * Returns null if the input doesn't parse — caller decides what to render.
 */
export function deadlinePhrase(input) {
  const days = daysFromToday(input);
  if (days === null) return null;
  if (days === 0) return "today";
  if (days === 1) return "tomorrow";
  if (days === -1) return "1 day overdue";
  if (days < -1) return `${Math.abs(days)} days overdue`;
  return `in ${days} days`;
}
