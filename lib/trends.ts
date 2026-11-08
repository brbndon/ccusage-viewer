import type { CcusageRow } from "@/lib/ccusage";

/** One calendar day of usage; days without rows are filled with zeros. */
export interface DayPoint {
  date: string;
  cost: number;
  tokens: number;
  costEstimated: boolean;
}

const DAY_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

export function parseDay(value: string): Date | null {
  const m = DAY_RE.exec(value);
  if (!m) return null;
  return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
}

export function dayKey(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function addDays(date: Date, days: number): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate() + days);
}

/** Longest series built (about three years); a runaway `since` must not freeze the UI. */
const MAX_SERIES_DAYS = 1100;

/**
 * Daily rows as a gap-free series. The scanned range widens the bounds so
 * quiet days at either end still count (a 30-day scan yields 30 days). The
 * series always runs to today, or to `until` when that is earlier, so an open
 * range ("All history") still sees recent quiet days.
 */
export function dailySeries(
  rows: CcusageRow[],
  range: { since: string; until: string },
  today = new Date()
): DayPoint[] {
  const byDay = new Map<string, DayPoint>();
  for (const r of rows) {
    if (!parseDay(r.period)) continue;
    const entry = byDay.get(r.period) ?? { date: r.period, cost: 0, tokens: 0, costEstimated: false };
    entry.cost += r.totalCost;
    entry.tokens += r.totalTokens;
    entry.costEstimated ||= r.costEstimated === true;
    byDay.set(r.period, entry);
  }
  if (byDay.size === 0) return [];

  const keys = [...byDay.keys()].sort();
  const since = parseDay(range.since);
  const until = parseDay(range.until);
  const todayStart = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  let start = parseDay(keys[0])!;
  let end = parseDay(keys[keys.length - 1])!;
  if (since && since < start) start = since;
  // Extend to the scan's end date, but never into the future.
  const rangeEnd = until && until < todayStart ? until : todayStart;
  if (rangeEnd > end) end = rangeEnd;
  const earliest = addDays(end, 1 - MAX_SERIES_DAYS);
  if (start < earliest) start = earliest;

  const series: DayPoint[] = [];
  for (let d = start; d <= end; d = addDays(d, 1)) {
    const key = dayKey(d);
    series.push(byDay.get(key) ?? { date: key, cost: 0, tokens: 0, costEstimated: false });
  }
  return series;
}

function sum(points: DayPoint[], field: "cost" | "tokens"): number {
  return points.reduce((acc, p) => acc + p[field], 0);
}

/** The series without today when today is its last day: a partial day skews averages and trends. */
export function completedDays(series: DayPoint[], today = new Date()): DayPoint[] {
  if (series.length > 2 && series[series.length - 1].date === dayKey(today)) return series.slice(0, -1);
  return series;
}

export interface WindowComparison {
  days: number;
  current: number;
  previous: number;
  /** Fractional change; null when the previous window had no spend. */
  change: number | null;
  /** The two windows back to back, oldest first, for a sparkline. */
  points: DayPoint[];
}

/** Trailing window vs the window before it: 7 vs 7 days when there is room. */
export function compareWindows(series: DayPoint[]): WindowComparison | null {
  const days = series.length >= 14 ? 7 : Math.floor(series.length / 2);
  if (days < 2) return null;
  const points = series.slice(-days * 2);
  const previous = sum(points.slice(0, days), "cost");
  const current = sum(points.slice(days), "cost");
  return {
    days,
    current,
    previous,
    change: previous > 0 ? (current - previous) / previous : null,
    points,
  };
}

export interface MonthOutlook {
  /** True when the series covers the month's first day, so month-to-date is complete. */
  complete: boolean;
  /** True when the series ends in the current month; a past month has nothing left to project. */
  current: boolean;
  monthLabel: string;
  monthToDate: number;
  projected: number;
  daysLeft: number;
  /** Average daily spend over the last `runRateDays` completed days, times 30. */
  runRate: number;
  runRateDays: number;
}

/**
 * Month-end projection: month-to-date plus the trailing 7-day pace for the remaining days.
 * Pace and run rate use completed days only; the run rate looks at the last 30 so a long
 * scan reflects recent habits rather than the whole history.
 */
export function monthOutlook(series: DayPoint[], today = new Date()): MonthOutlook | null {
  if (series.length === 0) return null;
  const last = parseDay(series[series.length - 1].date)!;
  const monthStart = new Date(last.getFullYear(), last.getMonth(), 1);
  const daysInMonth = new Date(last.getFullYear(), last.getMonth() + 1, 0).getDate();
  const daysLeft = daysInMonth - last.getDate();

  const inMonth = series.filter((p) => parseDay(p.date)! >= monthStart);
  const settled = completedDays(series, today);
  const trailing = settled.slice(-7);
  const pace = sum(trailing, "cost") / trailing.length;
  const monthToDate = sum(inMonth, "cost");
  const recent = settled.slice(-30);

  return {
    complete: parseDay(series[0].date)! <= monthStart,
    current: last.getFullYear() === today.getFullYear() && last.getMonth() === today.getMonth(),
    monthLabel: last.toLocaleDateString("en-US", { month: "long" }),
    monthToDate,
    projected: monthToDate + pace * daysLeft,
    daysLeft,
    runRate: (sum(recent, "cost") / recent.length) * 30,
    runRateDays: recent.length,
  };
}

export interface Streaks {
  current: number;
  longest: number;
  activeDays: number;
  totalDays: number;
}

/** A quiet "today" does not break the current streak; the day is not over yet. */
export function streaks(series: DayPoint[], today = new Date()): Streaks {
  let longest = 0;
  let run = 0;
  let activeDays = 0;
  for (const p of series) {
    if (p.tokens > 0) {
      activeDays += 1;
      run += 1;
      longest = Math.max(longest, run);
    } else {
      run = 0;
    }
  }

  let end = series.length - 1;
  if (end >= 0 && series[end].date === dayKey(today) && series[end].tokens === 0) end -= 1;
  let current = 0;
  for (let i = end; i >= 0 && series[i].tokens > 0; i -= 1) current += 1;

  return { current, longest, activeDays, totalDays: series.length };
}

export const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"] as const;

/** Average spend per weekday (quiet days count as zero), Sunday first. */
export function weekdayAverages(series: DayPoint[]): number[] {
  const totals = Array<number>(7).fill(0);
  const counts = Array<number>(7).fill(0);
  for (const p of series) {
    const day = parseDay(p.date)!.getDay();
    totals[day] += p.cost;
    counts[day] += 1;
  }
  return totals.map((t, i) => (counts[i] > 0 ? t / counts[i] : 0));
}

/** Trailing mean over `window` points; early points average what exists so far. */
export function rollingAverage(values: number[], window: number): number[] {
  const out: number[] = [];
  let acc = 0;
  for (let i = 0; i < values.length; i += 1) {
    acc += values[i];
    if (i >= window) acc -= values[i - window];
    out.push(acc / Math.min(i + 1, window));
  }
  return out;
}

export interface HeatmapCell extends DayPoint {
  /** 0 = no usage, 1–4 = percentile band of active-day spend. */
  level: number;
}

/** Calendar grid: one column per week (Sunday first), padded with nulls. */
export function heatmapWeeks(series: DayPoint[]): (HeatmapCell | null)[][] {
  if (series.length === 0) return [];
  const active = series.filter((p) => p.cost > 0).map((p) => p.cost).sort((a, b) => a - b);
  // Share of active days that cost strictly less, so ties share a band and the
  // darkest band is reachable even with only a few active days.
  const belowCount = (cost: number) => {
    let lo = 0;
    let hi = active.length;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (active[mid] < cost) lo = mid + 1;
      else hi = mid;
    }
    return lo;
  };
  const levelOf = (p: DayPoint) => {
    if (p.cost <= 0) return p.tokens > 0 ? 1 : 0;
    return 1 + Math.min(3, Math.floor((belowCount(p.cost) / active.length) * 4));
  };

  const weeks: (HeatmapCell | null)[][] = [];
  let week: (HeatmapCell | null)[] = Array(parseDay(series[0].date)!.getDay()).fill(null);
  for (const p of series) {
    week.push({ ...p, level: levelOf(p) });
    if (week.length === 7) {
      weeks.push(week);
      week = [];
    }
  }
  if (week.length > 0) weeks.push([...week, ...Array(7 - week.length).fill(null)]);
  return weeks;
}
