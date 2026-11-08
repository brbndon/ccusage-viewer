"use client";

import { useMemo, useState } from "react";
import type { CcusageRow, ViewKey } from "@/lib/ccusage";
import { formatMoney } from "@/lib/model-meta";
import {
  WEEKDAYS,
  compareWindows,
  dailySeries,
  monthOutlook,
  streaks,
  weekdayAverages,
} from "@/lib/trends";
import AnimatedNumber from "@/components/AnimatedNumber";
import Sparkline from "@/components/Sparkline";

const PLAN_KEY = "ccusage-viewer.plan.v1";
const PLAN_PRESETS = [20, 100, 200] as const;
const WEEKDAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

function readPlan(): number | null {
  try {
    const value = Number(window.localStorage.getItem(PLAN_KEY));
    return Number.isFinite(value) && value > 0 ? value : null;
  } catch {
    return null;
  }
}

function savePlan(value: number | null) {
  try {
    if (value) window.localStorage.setItem(PLAN_KEY, String(value));
    else window.localStorage.removeItem(PLAN_KEY);
  } catch {
    // Optional preference; storage can be unavailable.
  }
}

function Tile({
  label,
  index,
  children,
}: {
  label: string;
  index: number;
  children: React.ReactNode;
}) {
  return (
    <div
      className="reveal flex min-w-0 flex-col rounded-lg border border-slate-200/80 bg-slate-50/60 p-4"
      style={{ "--i": index } as React.CSSProperties}
    >
      <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">{label}</span>
      {children}
    </div>
  );
}

export default function TrendInsights({
  rows,
  view,
  range,
}: {
  rows: CcusageRow[];
  view: ViewKey;
  range: { since: string; until: string };
}) {
  const series = useMemo(
    () => (view === "daily" ? dailySeries(rows, range) : []),
    [range, rows, view]
  );
  // Only rendered after a client-side scan, so storage is available on first render.
  const [plan, setPlan] = useState<number | null>(readPlan);

  if (view !== "daily") {
    return (
      <p className="reveal rounded-xl border border-dashed border-slate-200 bg-white/60 px-4 py-3 text-xs text-slate-500">
        Trends, streaks, the month-end projection, and the plan comparison use{" "}
        <span className="font-semibold text-slate-700">Daily</span> granularity. Switch to Daily and scan to see them.
      </p>
    );
  }
  if (series.length < 2) return null;

  const estimated = series.some((p) => p.costEstimated);
  const mark = estimated ? "≈ " : "";
  const money = (n: number) => `${mark}${formatMoney(n)}`;

  const windows = compareWindows(series);
  const outlook = monthOutlook(series)!;
  const streak = streaks(series);
  const weekdays = weekdayAverages(series);
  const busiest = weekdays.indexOf(Math.max(...weekdays));
  const weekdayMax = weekdays[busiest] || 1;
  const recentDays = series.slice(-14);

  const monthlyValue = outlook.runRate;
  const ratio = plan ? monthlyValue / plan : null;

  function choosePlan(value: number | null) {
    setPlan(value);
    savePlan(value);
  }

  return (
    <section
      aria-labelledby="trends-heading"
      className="rounded-xl border border-slate-200/80 bg-white p-5 shadow-xs"
    >
      <div className="flex flex-wrap items-end justify-between gap-2 border-b border-slate-100 pb-3">
        <div>
          <h2 id="trends-heading" className="text-base font-semibold text-slate-900">
            Trends
          </h2>
          <p className="text-xs text-slate-500">
            {series.length} days, quiet days included{estimated ? " · ≈ includes estimated model costs" : ""}
          </p>
        </div>
      </div>

      <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {windows && (
          <Tile label={`Last ${windows.days} days`} index={0}>
            <div className="mt-1.5 flex items-baseline gap-2">
              <AnimatedNumber
                value={windows.current}
                format={money}
                className="num-tabular text-2xl font-bold tracking-tight text-slate-900"
              />
              {windows.change !== null && (
                <span
                  className={`num-tabular inline-flex items-center gap-0.5 rounded-full px-1.5 py-0.5 text-[11px] font-semibold ${
                    windows.change > 0.005
                      ? "bg-rose-50 text-rose-700"
                      : windows.change < -0.005
                        ? "bg-emerald-50 text-emerald-700"
                        : "bg-slate-100 text-slate-600"
                  }`}
                >
                  <span aria-hidden="true">{windows.change > 0.005 ? "↑" : windows.change < -0.005 ? "↓" : "→"}</span>
                  {Math.abs(windows.change * 100).toFixed(0)}%
                </span>
              )}
            </div>
            <p className="num-tabular text-[11px] text-slate-500">
              vs {money(windows.previous)} the {windows.days} days before
            </p>
            <div className="mt-auto pt-3">
              <Sparkline values={windows.points.map((p) => p.cost)} splitAt={windows.days - 1} />
            </div>
          </Tile>
        )}

        <Tile label={outlook.complete ? `Projected ${outlook.monthLabel}` : "Monthly run rate"} index={1}>
          <AnimatedNumber
            value={outlook.complete ? outlook.projected : outlook.runRate}
            format={money}
            className="num-tabular mt-1.5 text-2xl font-bold tracking-tight text-slate-900"
          />
          <p className="num-tabular text-[11px] text-slate-500">
            {outlook.complete
              ? `${money(outlook.monthToDate)} so far · ${outlook.daysLeft} ${outlook.daysLeft === 1 ? "day" : "days"} left at the 7-day pace`
              : "Average daily spend × 30. Scan from the 1st for a month-end projection."}
          </p>
          {outlook.complete && outlook.projected > 0 && (
            <div className="mt-auto pt-3">
              <div className="h-1.5 overflow-hidden rounded-full bg-slate-200/70">
                <div
                  className="bar-fill h-full rounded-full bg-blue-600"
                  style={{ "--fill": Math.min(1, outlook.monthToDate / outlook.projected) } as React.CSSProperties}
                />
              </div>
              <p className="mt-1 text-[10px] text-slate-400">month-to-date of projected</p>
            </div>
          )}
        </Tile>

        <Tile label="Current streak" index={2}>
          <p className="num-tabular mt-1.5 text-2xl font-bold tracking-tight text-slate-900">
            {streak.current} <span className="text-sm font-semibold text-slate-500">{streak.current === 1 ? "day" : "days"}</span>
          </p>
          <p className="num-tabular text-[11px] text-slate-500">
            Longest {streak.longest} · active {streak.activeDays} of {streak.totalDays} days
          </p>
          <ol className="mt-auto flex gap-1 pt-3" aria-label="Activity over the last 14 days">
            {recentDays.map((p, i) => (
              <li
                key={p.date}
                title={`${p.date}: ${p.tokens > 0 ? "active" : "no usage"}`}
                className={`pop-in h-3 flex-1 rounded-[3px] ${p.tokens > 0 ? "bg-blue-600" : "bg-slate-200"}`}
                style={{ "--i": i } as React.CSSProperties}
              >
                <span className="sr-only">{p.date}: {p.tokens > 0 ? "active" : "no usage"}</span>
              </li>
            ))}
          </ol>
        </Tile>

        <Tile label="Busiest weekday" index={3}>
          <p className="mt-1.5 text-2xl font-bold tracking-tight text-slate-900">{WEEKDAY_NAMES[busiest]}s</p>
          <p className="num-tabular text-[11px] text-slate-500">
            {money(weekdays[busiest])} on an average {WEEKDAY_NAMES[busiest]}
          </p>
          <div className="mt-auto flex h-10 items-end gap-1 pt-3" aria-hidden="true">
            {weekdays.map((v, i) => (
              <div key={WEEKDAYS[i]} className="flex h-full flex-1 flex-col items-center justify-end gap-0.5">
                <div
                  className={`grow-up w-full rounded-t-[3px] ${i === busiest ? "bg-blue-600" : "bg-slate-300"}`}
                  style={{ height: `${Math.max(6, (v / weekdayMax) * 100)}%`, "--i": i } as React.CSSProperties}
                />
                <span className="text-[9px] font-medium text-slate-400">{WEEKDAYS[i][0]}</span>
              </div>
            ))}
          </div>
        </Tile>
      </div>

      {/* Subscription value: the number built-in usage meters don't show. */}
      <div
        className="reveal mt-3 flex flex-col gap-3 rounded-lg border border-blue-100 bg-gradient-to-r from-blue-50/80 via-white to-white p-4 lg:flex-row lg:items-center lg:justify-between"
        style={{ "--i": 4 } as React.CSSProperties}
      >
        <div className="min-w-0">
          <p className="text-sm text-slate-700">
            At API prices this usage is worth{" "}
            <AnimatedNumber value={monthlyValue} format={money} className="num-tabular font-bold text-slate-900" />
            <span className="text-slate-500"> / month</span>
            {ratio !== null && (
              <>
                {ratio >= 1 ? (
                  <>
                    , <span className="num-tabular font-bold text-emerald-700">{ratio.toFixed(1)}×</span> your ${plan} plan.
                  </>
                ) : (
                  <>
                    , <span className="num-tabular font-bold text-amber-700">{Math.round(ratio * 100)}%</span> of your ${plan} plan.
                  </>
                )}
              </>
            )}
          </p>
          <p className="mt-0.5 text-[11px] text-slate-500">
            {ratio === null
              ? "Pick what you pay each month to see whether your subscription pays for itself."
              : ratio >= 1
                ? `Your subscription saves about ${money(monthlyValue - plan!)} a month compared with paying per token.`
                : "Paying per token would currently cost less than this plan."}
          </p>
        </div>

        <div className="flex shrink-0 flex-wrap items-center gap-1.5 text-xs">
          <span className="font-medium text-slate-500">Plan / mo</span>
          {PLAN_PRESETS.map((price) => (
            <button
              key={price}
              type="button"
              aria-pressed={plan === price}
              onClick={() => choosePlan(plan === price ? null : price)}
              className={`btn-press rounded-md border px-2.5 py-1 font-semibold transition-colors ${
                plan === price
                  ? "border-blue-600 bg-blue-600 text-white"
                  : "border-slate-200 bg-white text-slate-700 hover:border-slate-300"
              }`}
            >
              ${price}
            </button>
          ))}
          <label className="flex items-center gap-1 rounded-md border border-slate-200 bg-white px-2 py-1 focus-within:border-blue-500">
            <span className="text-slate-400">$</span>
            <input
              type="number"
              min={1}
              inputMode="decimal"
              aria-label="Custom monthly plan price in USD"
              placeholder="Other"
              value={plan !== null && !PLAN_PRESETS.includes(plan as (typeof PLAN_PRESETS)[number]) ? plan : ""}
              onChange={(e) => {
                const next = Number(e.target.value);
                choosePlan(Number.isFinite(next) && next > 0 ? next : null);
              }}
              className="w-14 bg-transparent text-slate-800 outline-hidden placeholder:text-slate-400"
            />
          </label>
        </div>
      </div>
    </section>
  );
}
