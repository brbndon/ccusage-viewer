"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { ActivityData } from "@/lib/activity";
import { agentLabel } from "@/lib/ccusage";
import { formatCompactNumber, formatMoney } from "@/lib/model-meta";
import {
  dayKey,
  fillSeries,
  heatmapWeeks,
  parseDay,
  streaks,
  type DayPoint,
  type HeatmapCell,
} from "@/lib/trends";
import { useReducedMotion } from "@/lib/use-reduced-motion";

/** Weeks shown, ending with the current one: about a year. */
const WEEKS = 53;
const GAP_PX = 4;
/** Below this the grid scrolls sideways rather than shrinking the cells further. */
const MIN_CELL_PX = 11;
/** Column stagger on entry; short enough that a full year still settles quickly. */
const COLUMN_STAGGER_MS = 10;
const CHART_HEIGHT = 220;
/** Roughly half the day tooltip's width, used to keep it inside the card at either edge. */
const TOOLTIP_HALF_WIDTH_PX = 100;

/** Empty days, then four bands of busier days, dark to bright. */
const LEVEL_CLASSES = ["bg-zinc-800", "bg-[#0b3d73]", "bg-[#0a63b8]", "bg-[#2b97ff]", "bg-[#8ccbff]"];

const TABS = [
  { id: "daily", label: "Daily" },
  { id: "weekly", label: "Weekly" },
  { id: "cumulative", label: "Cumulative" },
] as const;
type TabId = (typeof TABS)[number]["id"];

/** The Sunday that starts the first of the {@link WEEKS} columns. */
function windowStart(today: Date): string {
  return dayKey(new Date(today.getFullYear(), today.getMonth(), today.getDate() - today.getDay() - (WEEKS - 1) * 7));
}

function formatDate(date: string, options: Intl.DateTimeFormatOptions): string {
  return parseDay(date)!.toLocaleDateString("en-US", options);
}

function formatDuration(minutes: number): string {
  const total = Math.round(minutes);
  const days = Math.floor(total / 1440);
  const hours = Math.floor((total % 1440) / 60);
  if (days > 0) return `${days}d ${hours}h`;
  if (hours > 0) return `${hours}h ${total % 60}m`;
  return `${total}m`;
}

/** Month names under the columns where a month begins, kept clear of each other. */
function monthLabels(weeks: (HeatmapCell | null)[][]): { column: number; label: string }[] {
  const labels: { column: number; label: string }[] = [];
  let previousMonth = -1;
  let lastColumn = -3;
  weeks.forEach((week, column) => {
    const first = week.find((c) => c !== null);
    if (!first) return;
    const month = parseDay(first.date)!.getMonth();
    if (month !== previousMonth && column - lastColumn >= 3) {
      labels.push({ column, label: formatDate(first.date, { month: "short" }) });
      lastColumn = column;
    }
    previousMonth = month;
  });
  return labels;
}

function Metric({ label, value, title }: { label: string; value: string; title?: string }) {
  return (
    <div className="flex flex-col-reverse gap-0.5 px-3 text-center sm:border-l sm:border-zinc-800 sm:first:border-l-0" title={title}>
      <dt className="text-sm text-zinc-400">{label}</dt>
      <dd className="num-tabular text-xl font-medium text-white">{value}</dd>
    </div>
  );
}

interface ChartTooltipProps {
  active?: boolean;
  payload?: { value: number; payload: { label: string } }[];
}

function ChartTooltip({ active, payload }: ChartTooltipProps) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-xs text-zinc-100 shadow-lg">
      <p className="text-zinc-400">{payload[0].payload.label}</p>
      <p className="num-tabular font-semibold">{formatCompactNumber(payload[0].value)} tokens</p>
    </div>
  );
}

/** Appears the moment the pointer is over a day, styled like the chart tooltips. */
function DayTooltip({ cell, x, y }: { cell: DayPoint; x: number; y: number }) {
  return (
    <div
      role="presentation"
      className="pointer-events-none absolute z-10 w-max rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-xs text-zinc-100 shadow-lg"
      style={{ left: x, top: y - 8, transform: "translate(-50%, -100%)" }}
    >
      <p className="font-semibold text-white">
        {formatDate(cell.date, { weekday: "long", month: "long", day: "numeric", year: "numeric" })}
      </p>
      {cell.tokens === 0 ? (
        <p className="text-zinc-400">No usage</p>
      ) : (
        <p className="num-tabular text-zinc-400">
          {formatCompactNumber(cell.tokens)} tokens · {cell.costEstimated ? "≈ " : ""}
          {formatMoney(cell.cost)}
        </p>
      )}
    </div>
  );
}

const AXIS_TICK = { fill: "#a1a1aa", fontSize: 11 };

export default function ActivityHeatmap({
  freshScanAt,
}: {
  /** Set once a scan finishes in this session; the activity data is rebuilt then. */
  freshScanAt: string | null;
}) {
  const [activity, setActivity] = useState<ActivityData | null>(null);
  const [failed, setFailed] = useState(false);
  const [tab, setTab] = useState<TabId>("daily");
  const [hover, setHover] = useState<{ cell: DayPoint; x: number; y: number; width: number } | null>(null);
  const gridFrameRef = useRef<HTMLDivElement>(null);
  const reducedMotion = useReducedMotion();

  // Show the saved copy straight away; a scan run here rebuilds it, keeping the old one on screen meanwhile.
  useEffect(() => {
    const ctrl = new AbortController();
    fetch(freshScanAt ? "/api/activity?refresh=1" : "/api/activity", { signal: ctrl.signal })
      .then((res) => (res.ok ? (res.json() as Promise<ActivityData>) : Promise.reject(new Error(String(res.status)))))
      .then((body) => {
        setActivity(body);
        setFailed(false);
      })
      .catch(() => {
        if (!ctrl.signal.aborted) setFailed(true);
      });
    return () => ctrl.abort();
  }, [freshScanAt]);

  const model = useMemo(() => {
    if (!activity || activity.days.length === 0) return null;
    const today = new Date();
    const byDay = new Map<string, DayPoint>();
    for (const d of activity.days) {
      byDay.set(d.date, { date: d.date, tokens: d.tokens, cost: d.cost, costEstimated: d.costEstimated === true });
    }
    const start = windowStart(today);
    const all = fillSeries(byDay, { since: start, until: "" }, today);
    const series = all.filter((p) => p.date >= start);
    const weeks = heatmapWeeks(series);
    const cellsByDate = new Map(weeks.flat().flatMap((c) => (c ? [[c.date, c] as const] : [])));

    const weekly = weeks.map((week) => {
      const days = week.filter((c): c is HeatmapCell => c !== null);
      return {
        label: `Week of ${formatDate(days[0].date, { month: "short", day: "numeric" })}`,
        tokens: days.reduce((acc, c) => acc + c.tokens, 0),
      };
    });
    let running = 0;
    const cumulative = series.map((p) => {
      running += p.tokens;
      return { label: formatDate(p.date, { month: "short", day: "numeric", year: "numeric" }), tokens: running };
    });
    const peak = activity.days.reduce((best, d) => (d.tokens > best.tokens ? d : best));

    return {
      series,
      weeks,
      cellsByDate,
      weekly,
      cumulative,
      labels: monthLabels(weeks),
      activeDays: series.filter((p) => p.tokens > 0).length,
      lifetime: activity.days.reduce((acc, d) => acc + d.tokens, 0),
      peak,
      streak: streaks(all),
      firstDate: activity.days[0].date,
    };
  }, [activity]);

  if (failed && !activity) {
    return (
      <p role="status" className="rounded-xl border border-slate-200 bg-white p-4 text-xs text-slate-600 shadow-xs">
        Token activity could not be loaded. Scan again to retry.
      </p>
    );
  }
  if (!activity) {
    return <div aria-hidden="true" className="h-72 animate-pulse rounded-2xl border border-zinc-800 bg-zinc-950" />;
  }
  if (!model) {
    return (
      <p role="status" className="rounded-xl border border-slate-200 bg-white p-4 text-xs text-slate-600 shadow-xs">
        No token activity was found on this machine yet.
      </p>
    );
  }

  const { weeks, labels, streak, peak, lifetime, activeDays, series } = model;
  const columns = weeks.length;
  const session = activity.longestSession;
  const sinceLabel = formatDate(model.firstDate, { month: "short", day: "numeric", year: "numeric" });
  const updated = new Date(activity.generatedAt).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });

  return (
    <section aria-labelledby="activity-heading" className="flex flex-col gap-3">
      <div className="rounded-2xl border border-zinc-800 bg-zinc-950 p-5 text-zinc-100 shadow-xs">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 id="activity-heading" className="text-xl font-semibold tracking-tight text-white">
            Token activity
          </h2>
          <div role="group" aria-label="Activity view" className="flex gap-4 text-sm font-medium">
            {TABS.map(({ id, label }) => (
              <button
                key={id}
                type="button"
                aria-pressed={tab === id}
                onClick={() => {
                  setTab(id);
                  setHover(null);
                }}
                className={`btn-press rounded-sm transition-colors focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-blue-400 ${
                  tab === id ? "text-white" : "text-zinc-400 hover:text-zinc-200"
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        <div className="mt-5">
          {tab === "daily" && (
            // The tooltip sits outside the scroller, which would clip it above the top row.
            <div ref={gridFrameRef} className="relative">
              {hover && (
                <DayTooltip
                  cell={hover.cell}
                  x={Math.min(Math.max(hover.x, TOOLTIP_HALF_WIDTH_PX), hover.width - TOOLTIP_HALF_WIDTH_PX)}
                  y={hover.y}
                />
              )}
              <div className="overflow-x-auto pb-1" onScroll={() => setHover(null)}>
              <div style={{ minWidth: columns * (MIN_CELL_PX + GAP_PX) }}>
                <div
                  className="grid"
                  role="img"
                  aria-label={`Daily token activity over the last year: ${activeDays} of ${series.length} days active`}
                  style={{
                    gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))`,
                    gridTemplateRows: "repeat(7, auto)",
                    gridAutoFlow: "column",
                    gap: GAP_PX,
                  }}
                  onPointerOver={(e) => {
                    const target = (e.target as HTMLElement).closest<HTMLElement>("[data-date]");
                    const frame = gridFrameRef.current;
                    const cell = target?.dataset.date ? model.cellsByDate.get(target.dataset.date) : undefined;
                    if (!target || !frame || !cell) {
                      setHover(null);
                      return;
                    }
                    const cellBox = target.getBoundingClientRect();
                    const frameBox = frame.getBoundingClientRect();
                    setHover({
                      cell,
                      x: cellBox.left - frameBox.left + cellBox.width / 2,
                      y: cellBox.top - frameBox.top,
                      width: frameBox.width,
                    });
                  }}
                  onPointerLeave={() => setHover(null)}
                >
                  {weeks.flatMap((week, col) =>
                    week.map((cell, row) =>
                      cell ? (
                        <span
                          key={cell.date}
                          data-date={cell.date}
                          className={`heat-cell aspect-square rounded-[4px] ${LEVEL_CLASSES[cell.level]}`}
                          style={{ animationDelay: `${col * COLUMN_STAGGER_MS}ms` }}
                        />
                      ) : (
                        <span key={`pad-${col}-${row}`} />
                      )
                    )
                  )}
                </div>
                <div
                  className="mt-3 grid text-sm text-zinc-400"
                  aria-hidden="true"
                  style={{ gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))`, columnGap: GAP_PX }}
                >
                  {labels.map(({ column, label }) => (
                    <span
                      key={column}
                      className="whitespace-nowrap"
                      // The last columns would run off the edge, so those labels start a little earlier.
                      style={{ gridColumn: `${Math.min(column + 1, columns - 2)} / span 3`, gridRow: 1 }}
                    >
                      {label}
                    </span>
                  ))}
                </div>
              </div>
              </div>
            </div>
          )}

          {tab !== "daily" && (
            <div style={{ height: CHART_HEIGHT }} role="img" aria-label={`${tab === "weekly" ? "Weekly" : "Cumulative"} token activity over the last year`}>
              <ResponsiveContainer width="100%" height="100%">
                {tab === "weekly" ? (
                  <BarChart data={model.weekly} margin={{ top: 4, right: 4, bottom: 0, left: 0 }}>
                    <CartesianGrid vertical={false} stroke="#27272a" />
                    <XAxis dataKey="label" tick={false} axisLine={{ stroke: "#3f3f46" }} tickLine={false} />
                    <YAxis tick={AXIS_TICK} axisLine={false} tickLine={false} width={48} tickFormatter={formatCompactNumber} />
                    <Tooltip content={<ChartTooltip />} cursor={{ fill: "#27272a" }} />
                    <Bar dataKey="tokens" fill="#2b97ff" radius={[3, 3, 0, 0]} isAnimationActive={!reducedMotion} />
                  </BarChart>
                ) : (
                  <AreaChart data={model.cumulative} margin={{ top: 4, right: 4, bottom: 0, left: 0 }}>
                    <CartesianGrid vertical={false} stroke="#27272a" />
                    <XAxis dataKey="label" tick={false} axisLine={{ stroke: "#3f3f46" }} tickLine={false} />
                    <YAxis tick={AXIS_TICK} axisLine={false} tickLine={false} width={48} tickFormatter={formatCompactNumber} />
                    <Tooltip content={<ChartTooltip />} cursor={{ stroke: "#52525b" }} />
                    <Area
                      type="monotone"
                      dataKey="tokens"
                      stroke="#2b97ff"
                      strokeWidth={2}
                      fill="#0a63b8"
                      fillOpacity={0.35}
                      isAnimationActive={!reducedMotion}
                    />
                  </AreaChart>
                )}
              </ResponsiveContainer>
            </div>
          )}
        </div>
      </div>

      <dl className="grid grid-cols-2 gap-y-4 rounded-2xl border border-zinc-800 bg-zinc-950 py-4 sm:grid-cols-5">
        <Metric label="Lifetime tokens" value={formatCompactNumber(lifetime)} title={`${lifetime.toLocaleString("en-US")} tokens since ${sinceLabel}`} />
        <Metric
          label="Peak tokens"
          value={formatCompactNumber(peak.tokens)}
          title={`Busiest day: ${formatDate(peak.date, { weekday: "short", month: "short", day: "numeric", year: "numeric" })}`}
        />
        <Metric
          label="Longest session"
          value={session ? formatDuration(session.minutes) : "—"}
          title={
            session
              ? `${agentLabel(session.agent)}: first to last activity, ${new Date(session.start).toLocaleString("en-US")} to ${new Date(session.end).toLocaleString("en-US")}`
              : "No agent reported session start times"
          }
        />
        <Metric label="Longest streak" value={`${streak.longest} ${streak.longest === 1 ? "day" : "days"}`} />
        <Metric label="Current streak" value={`${streak.current} ${streak.current === 1 ? "day" : "days"}`} />
      </dl>

      <p className="text-xs text-slate-500">
        All history across {activity.providers.map(agentLabel).join(", ")} · since {sinceLabel} · updated {updated}. Not affected by the date range or model filter.
      </p>
    </section>
  );
}
