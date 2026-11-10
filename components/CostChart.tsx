"use client";

import {
  Bar,
  CartesianGrid,
  Cell,
  ComposedChart,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { CcusageRow, ViewKey } from "@/lib/ccusage";
import { periodLabel, periodNoun } from "@/lib/ccusage";
import { formatCompactNumber, formatChartMoney } from "@/lib/model-meta";
import { rollingAverage } from "@/lib/trends";
import { useReducedMotion } from "@/lib/use-reduced-motion";

/** Trailing-average window per view, sized to smooth one natural cycle. */
const TREND_WINDOW: Record<ViewKey, { size: number; label: string }> = {
  // Rows skip periods with no usage, so these average active periods, not calendar ones.
  daily: { size: 7, label: "7-active-day avg" },
  weekly: { size: 4, label: "4-active-week avg" },
  monthly: { size: 3, label: "3-active-month avg" },
  session: { size: 5, label: "5-session avg" },
  blocks: { size: 5, label: "5-block avg" },
};

interface TooltipPayloadItem {
  value: number;
  payload: {
    name: string;
    cost: number;
    trend: number;
    tokens: number;
    costEstimated: boolean;
  };
}

function CustomTooltip({
  active,
  payload,
  label,
  trendLabel,
}: {
  active?: boolean;
  payload?: TooltipPayloadItem[];
  label?: string;
  trendLabel: string;
}) {
  if (!active || !payload || !payload.length) return null;
  const data = payload[0].payload;

  return (
    <div className="rounded-lg border border-slate-200 bg-slate-900 px-3 py-2 text-xs shadow-lg">
      <p className="font-semibold text-slate-100">{label}</p>
      <div className="mt-1 flex items-center justify-between gap-4">
        <span className="text-slate-400">Cost:</span>
        <span className="num-tabular font-bold text-emerald-400">
          {data.costEstimated ? "≈ " : ""}{formatChartMoney(data.cost)}
        </span>
      </div>
      <div className="flex items-center justify-between gap-4">
        <span className="text-slate-400">{trendLabel}:</span>
        <span className="num-tabular text-sky-300">
          {data.costEstimated ? "≈ " : ""}{formatChartMoney(data.trend)}
        </span>
      </div>
      <div className="flex items-center justify-between gap-4">
        <span className="text-slate-400">Tokens:</span>
        <span className="num-tabular text-slate-200">
          {formatCompactNumber(data.tokens)}
        </span>
      </div>
    </div>
  );
}

export default function CostChart({ rows, view }: { rows: CcusageRow[]; view: ViewKey }) {
  const reduced = useReducedMotion();
  const trendWindow = TREND_WINDOW[view];
  // Average over every row so the first charted bars have real history behind them.
  const trend = rollingAverage(rows.map((r) => Number(r.totalCost ?? 0)), trendWindow.size);
  // Rows arrive in chronological order, so the tail is the most recent.
  const offset = Math.max(0, rows.length - 30);
  const data = rows.slice(offset).map((r, i) => ({
    name: periodLabel(r, view),
    cost: Number(r.totalCost ?? 0),
    trend: trend[offset + i],
    tokens: Number(r.totalTokens ?? 0),
    costEstimated: r.costEstimated === true,
  }));

  if (data.length === 0) {
    return (
      <div className="rounded-xl border border-slate-200/80 bg-white p-6 text-center text-sm text-slate-500 shadow-xs">
        No rows available to chart.
      </div>
    );
  }

  // Calculate high and average for context
  let peak = 0;
  let sum = 0;
  for (const d of data) {
    if (d.cost > peak) peak = d.cost;
    sum += d.cost;
  }
  const avg = data.length > 0 ? sum / data.length : 0;
  const estimated = data.some((d) => d.costEstimated);

  return (
    <section aria-labelledby="cost-timeline-heading" className="rounded-xl border border-slate-200/80 bg-white p-5 shadow-xs">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 pb-3">
        <div>
          <h2 id="cost-timeline-heading" className="text-base font-semibold text-slate-900">
            Cost Timeline
          </h2>
          <p className="text-xs text-slate-500">
            Spend trends across the last {data.length} {periodNoun(view, data.length)}
            {estimated ? " · ≈ includes estimated model costs" : ""}
          </p>
        </div>

        <div className="flex items-center gap-3 text-xs">
          <div className="flex items-center gap-1.5 text-slate-500">
            <span aria-hidden="true" className="h-0.5 w-4 rounded-full bg-sky-500" />
            <span>{trendWindow.label}</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="text-slate-400">Avg:</span>
            <span className="num-tabular font-semibold text-slate-700">
              {estimated ? "≈ " : ""}{formatChartMoney(avg)}
            </span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="text-slate-400">Peak:</span>
            <span className="num-tabular font-semibold text-amber-600">
              {estimated ? "≈ " : ""}{formatChartMoney(peak)}
            </span>
          </div>
        </div>
      </div>

      <div style={{ height: 260 }}>
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={data} margin={{ top: 10, right: 10, left: -10, bottom: 0 }}>
            <defs>
              <linearGradient id="cost-bar-fill" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#2563eb" />
                <stop offset="100%" stopColor="#60a5fa" />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
            <XAxis
              dataKey="name"
              tick={{ fontSize: 11, fill: "#64748b" }}
              axisLine={{ stroke: "#e2e8f0" }}
              tickLine={{ stroke: "#e2e8f0" }}
              interval="preserveStartEnd"
            />
            <YAxis
              tick={{ fontSize: 11, fill: "#64748b" }}
              axisLine={false}
              tickLine={false}
              tickFormatter={formatChartMoney}
              width={55}
            />
            <Tooltip content={<CustomTooltip trendLabel={trendWindow.label} />} cursor={{ fill: "#f1f5f9" }} />
            <Bar
              dataKey="cost"
              fill="url(#cost-bar-fill)"
              radius={[4, 4, 0, 0]}
              name="Cost"
              isAnimationActive={!reduced}
              animationDuration={700}
              animationEasing="ease-out"
            >
              {data.map((d, i) => (
                <Cell key={i} fill={d.cost === peak && peak > 0 ? "#f59e0b" : "url(#cost-bar-fill)"} />
              ))}
            </Bar>
            <Line
              type="monotone"
              dataKey="trend"
              name={trendWindow.label}
              stroke="#0ea5e9"
              strokeWidth={2}
              dot={false}
              activeDot={{ r: 3.5, stroke: "#ffffff", strokeWidth: 2 }}
              isAnimationActive={!reduced}
              animationBegin={250}
              animationDuration={900}
              animationEasing="ease-out"
            />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
    </section>
  );
}
