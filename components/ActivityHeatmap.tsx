"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { CcusageRow } from "@/lib/ccusage";
import { formatCompactNumber, formatMoney } from "@/lib/model-meta";
import { WEEKDAYS, dailySeries, heatmapWeeks, parseDay, type HeatmapCell } from "@/lib/trends";

/** Sequential blue ramp, lightest to darkest; level 0 is "no usage". */
const LEVEL_CLASSES = [
  "bg-slate-100",
  "bg-blue-200",
  "bg-blue-400",
  "bg-blue-600",
  "bg-blue-800",
];

/** Column stagger, capped so long histories still finish quickly. */
const COLUMN_STAGGER_MS = 18;
const MAX_STAGGER_MS = 540;

/** Short ranges get bigger cells so a 30-day scan still fills the card. */
function cellSizeFor(weekCount: number): number {
  if (weekCount <= 8) return 26;
  if (weekCount <= 16) return 20;
  if (weekCount <= 30) return 15;
  return 12;
}

function describeDay(cell: HeatmapCell): string {
  const date = parseDay(cell.date)!.toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
  });
  if (cell.tokens === 0) return `${date}: no usage`;
  return `${date}: ${cell.costEstimated ? "≈ " : ""}${formatMoney(cell.cost)} · ${formatCompactNumber(cell.tokens)} tokens`;
}

export default function ActivityHeatmap({
  rows,
  range,
}: {
  rows: CcusageRow[];
  range: { since: string; until: string };
}) {
  const series = useMemo(() => dailySeries(rows, range), [range, rows]);
  const weeks = useMemo(() => heatmapWeeks(series), [series]);
  const [focused, setFocused] = useState<HeatmapCell | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Long histories overflow; start at the most recent weeks.
  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollLeft = el.scrollWidth;
  }, [weeks]);

  if (weeks.length === 0) return null;

  const size = cellSizeFor(weeks.length);
  const gap = size >= 20 ? 4 : 3;
  const cellStyle = { width: size, height: size };
  const activeDays = series.filter((p) => p.tokens > 0).length;
  const peak = series.reduce((best, p) => (p.cost > best.cost ? p : best), series[0]);
  const topDays = series
    .filter((p) => p.cost > 0)
    .sort((a, b) => b.cost - a.cost)
    .slice(0, 5);
  const monthLabels = weeks.map((week, i) => {
    const first = week.find((c) => c !== null);
    if (!first) return "";
    const date = parseDay(first.date)!;
    const prev = i > 0 ? weeks[i - 1].find((c) => c !== null) : null;
    const prevMonth = prev ? parseDay(prev.date)!.getMonth() : -1;
    return date.getMonth() !== prevMonth ? date.toLocaleDateString("en-US", { month: "short" }) : "";
  });

  return (
    <section
      aria-labelledby="activity-heading"
      className="rounded-xl border border-slate-200/80 bg-white p-5 shadow-xs"
    >
      <div className="flex flex-wrap items-end justify-between gap-2 border-b border-slate-100 pb-3">
        <div>
          <h2 id="activity-heading" className="text-base font-semibold text-slate-900">
            Activity
          </h2>
          <p className="text-xs text-slate-500">Daily spend intensity · darker is busier</p>
        </div>
        <p className="num-tabular min-h-4 text-xs text-slate-600" aria-hidden="true">
          {focused
            ? describeDay(focused)
            : peak.cost > 0
              ? `Peak: ${describeDay({ ...peak, level: 4 })}`
              : ""}
        </p>
      </div>

      <div className="mt-4 flex flex-col gap-6 lg:flex-row lg:items-start">
        <div className="min-w-0">
          <div ref={scrollRef} className="overflow-x-auto pb-1">
          <div className="inline-flex gap-2">
            <div className="flex flex-col pt-4 text-[9px] font-medium text-slate-400" style={{ gap }} aria-hidden="true">
              {WEEKDAYS.map((d, i) => (
                <span key={d} className="flex items-center" style={{ height: size }}>
                  {i % 2 === 1 ? d : ""}
                </span>
              ))}
            </div>
            <div
              className="flex"
              style={{ gap }}
              role="img"
              aria-label={`Daily activity calendar: ${activeDays} of ${series.length} days active${peak.cost > 0 ? `; peak ${describeDay({ ...peak, level: 4 })}` : ""}`}
              onMouseLeave={() => setFocused(null)}
            >
              {weeks.map((week, col) => (
                <div key={col} className="flex flex-col" style={{ gap }}>
                  <span className="h-3 overflow-visible whitespace-nowrap text-[9px] font-medium leading-3 text-slate-400">
                    {monthLabels[col]}
                  </span>
                  {week.map((cell, row) =>
                    cell ? (
                      <span
                        key={cell.date}
                        title={describeDay(cell)}
                        onMouseEnter={() => setFocused(cell)}
                        className={`heat-cell rounded-[3px] ${LEVEL_CLASSES[cell.level]} ${
                          cell.date === peak.date && peak.cost > 0 ? "ring-1 ring-amber-400 ring-offset-1" : ""
                        }`}
                        style={{ ...cellStyle, animationDelay: `${Math.min(col * COLUMN_STAGGER_MS, MAX_STAGGER_MS)}ms` }}
                      />
                    ) : (
                      <span key={`pad-${row}`} style={cellStyle} />
                    )
                  )}
                </div>
              ))}
            </div>
          </div>
          </div>
          <div className="mt-3 flex items-center gap-1.5 text-[10px] text-slate-400" aria-hidden="true">
            <span>Less</span>
            {LEVEL_CLASSES.map((cls) => (
              <span key={cls} className={`h-2.5 w-2.5 rounded-[3px] ${cls}`} />
            ))}
            <span>More</span>
          </div>
        </div>

        {topDays.length > 0 && (
          <div className="min-w-0 flex-1 lg:min-w-64 lg:border-l lg:border-slate-100 lg:pl-6">
            <h3 className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">Biggest days</h3>
            <ol className="mt-2 flex flex-col gap-2.5">
              {topDays.map((p, i) => (
                <li key={p.date} className="pop-in" style={{ "--i": i } as React.CSSProperties}>
                  <div className="flex items-baseline justify-between gap-3 text-xs">
                    <span className="font-medium text-slate-700">
                      {parseDay(p.date)!.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" })}
                    </span>
                    <span className="num-tabular font-semibold text-slate-900">
                      {p.costEstimated ? "≈ " : ""}{formatMoney(p.cost)}
                      <span className="ml-1.5 font-normal text-slate-400">{formatCompactNumber(p.tokens)} tok</span>
                    </span>
                  </div>
                  <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-slate-100">
                    <div
                      className={`bar-fill h-full rounded-full ${i === 0 ? "bg-amber-500" : "bg-blue-500"}`}
                      style={{ "--fill": p.cost / topDays[0].cost } as React.CSSProperties}
                    />
                  </div>
                </li>
              ))}
            </ol>
          </div>
        )}
      </div>
    </section>
  );
}
