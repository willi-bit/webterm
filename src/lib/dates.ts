import type { YearMonth } from "../data/site";

const monthNames = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

function parts(value: YearMonth): [number, number] {
  const [year = "0", month = "1"] = value.split("-");
  return [Number(year), Number(month)];
}

/** "2023-11" → "Nov 2023" */
export function formatMonth(value: YearMonth): string {
  const [year, month] = parts(value);
  return `${monthNames[month - 1] ?? "???"} ${year}`;
}

/** "Nov 2023 — Present" / "Oct 2022 — Nov 2023" */
export function formatPeriod(start: YearMonth, end?: YearMonth): string {
  return `${formatMonth(start)} — ${end ? formatMonth(end) : "Present"}`;
}

/**
 * Whole months between start and end (inclusive of the start month, like a
 * LinkedIn duration). Ongoing periods run until `now`.
 */
export function monthsBetween(start: YearMonth, end: YearMonth | undefined, now: Date): number {
  const [startYear, startMonth] = parts(start);
  const [endYear, endMonth] = end
    ? parts(end)
    : [now.getFullYear(), now.getMonth() + 1];
  return Math.max(1, (endYear - startYear) * 12 + (endMonth - startMonth) + 1);
}

/** 35 → "2y 11m", 5 → "5m", 24 → "2y" */
export function formatDuration(months: number): string {
  const years = Math.floor(months / 12);
  const rest = months % 12;
  if (years === 0) {
    return `${rest}m`;
  }
  return rest === 0 ? `${years}y` : `${years}y ${rest}m`;
}
