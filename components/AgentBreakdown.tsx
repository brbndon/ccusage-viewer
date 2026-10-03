"use client";

import { useMemo, useState } from "react";
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  agentLabel,
  agentSharesOfRow,
  periodLabel,
  periodNoun,
  rollupAgents,
  type CcusageRow,
  type ViewKey,
} from "@/lib/ccusage";
import { formatCompactNumber, formatMoney } from "@/lib/model-meta";

type Metric = "cost" | "tokens";

/**
 * Fixed categorical slots (validated palette, light surface), assigned per
 * agent so a color always means the same tool. Agents without a slot fold
 * into "Other" in the chart rather than reusing a hue.
 */
const AGENT_COLORS: Record<string, string> = {
  codex: "#2a78d6",
  claude: "#eb6834",
  opencode: "#1baf7a",
  antigravity: "#eda100",
  gemini: "#e87ba4",
  copilot: "#008300",
  amp: "#4a3aa7",
  droid: "#e34948",
};
const OTHER_COLOR = "#94a3b8";

function seriesKey(agent: string): string {
  return agent in AGENT_COLORS ? agent : "other";
}

function colorOf(agent: string): string {
  return AGENT_COLORS[agent] ?? OTHER_COLOR;
}

function formatMetric(metric: Metric, value: number): string {
  return metric === "cost" ? formatMoney(value) : formatCompactNumber(value);
}

const compactTokens = new Intl.NumberFormat("en-US", {
  notation: "compact",
  maximumFractionDigits: 1,
});
const compactMoney = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  notation: "compact",
  maximumFractionDigits: 2,
});

function formatAxisValue(metric: Metric, value: number): string {
  return metric === "cost" ? compactMoney.format(value) : compactTokens.format(value);
}

/** "2026-09-27" -> "Sep 27" for daily ticks; other periods pass through. */
function formatAxisPeriod(view: ViewKey, period: string): string {
  const match = view === "daily" ? /^(\d{4})-(\d{2})-(\d{2})$/.exec(period) : null;
  if (!match) return period;
  const date = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

const VIEW_PREFIX: Partial<Record<ViewKey, string>> = {
  daily: "Daily",
  weekly: "Weekly",
  monthly: "Monthly",
};

interface TooltipPayloadItem {
  dataKey: string;
  value: number;
}

function AgentTooltip({
  active,
  payload,
  label,
  metric,
}: {
  active?: boolean;
  payload?: TooltipPayloadItem[];
  label?: string;
  metric: Metric;
}) {
  if (!active || !payload?.length) return null;
  const items = [...payload].sort((a, b) => b.value - a.value);

  return (
    <div className="min-w-44 rounded-lg border border-slate-200 bg-slate-900 px-3 py-2 text-xs shadow-lg">
      <p className="font-semibold text-slate-100">{label}</p>
      {items.map((item) => (
        <div key={item.dataKey} className="mt-1 flex items-center justify-between gap-4">
          <span className="flex items-center gap-1.5 text-slate-300">
            <span
              className="h-2 w-2 rounded-full"
              style={{ backgroundColor: colorOf(item.dataKey) }}
            />
            {agentLabel(item.dataKey)}
          </span>
          <span className="num-tabular font-semibold text-slate-100">
            {formatMetric(metric, item.value)}
          </span>
        </div>
      ))}
    </div>
  );
}

export default function AgentBreakdown({
  rows,
  view,
}: {
  rows: CcusageRow[];
  view: ViewKey;
}) {
  const [metric, setMetric] = useState<Metric>("cost");
  const agents = useMemo(() => rollupAgents(rows), [rows]);
  const showChart = view in VIEW_PREFIX;

  const { chartData, chartKeys } = useMemo(() => {
    if (!showChart) return { chartData: [], chartKeys: [] as string[] };
    const keys = [...new Set(agents.map((a) => seriesKey(a.agent)))];
    const data = rows.map((row) => {
      const point: Record<string, string | number> = { name: periodLabel(row, view) };
      for (const key of keys) point[key] = 0;
      for (const [agent, share] of agentSharesOfRow(row)) {
        point[seriesKey(agent)] =
          (point[seriesKey(agent)] as number) + (metric === "cost" ? share.cost : share.tokens);
      }
      return point;
    });
    return { chartData: data, chartKeys: keys };
  }, [agents, metric, rows, showChart, view]);

  if (agents.length === 0) return null;

  const valueOf = (a: { cost: number; tokens: number }) =>
    metric === "cost" ? a.cost : a.tokens;
  const total = agents.reduce((sum, a) => sum + valueOf(a), 0);
  const sortedAgents = [...agents].sort((a, b) => valueOf(b) - valueOf(a));
  const chartTitle = `${VIEW_PREFIX[view] ?? ""} ${metric === "cost" ? "cost" : "processed tokens"}`;

  return (
    <section
      aria-labelledby="agent-breakdown-heading"
      className="rounded-xl border border-slate-200/80 bg-white p-5 shadow-xs"
    >
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 pb-3">
        <div>
          <h2 id="agent-breakdown-heading" className="text-base font-semibold text-slate-900">
            Usage by Agent
          </h2>
          <p className="text-xs text-slate-500">
            {metric === "cost" ? "Spend" : "Tokens"} per coding tool across this scan
          </p>
        </div>
        <div className="inline-flex rounded-md border border-slate-200 bg-slate-50 p-0.5 text-xs">
          {(["cost", "tokens"] as const).map((m) => (
            <button
              key={m}
              type="button"
              aria-pressed={metric === m}
              onClick={() => setMetric(m)}
              className={`btn-press rounded px-2.5 py-0.5 font-medium transition-colors ${
                metric === m
                  ? "bg-white text-slate-900 shadow-xs"
                  : "text-slate-600 hover:text-slate-900"
              }`}
            >
              {m === "cost" ? "Cost" : "Tokens"}
            </button>
          ))}
        </div>
      </div>

      <div className={`mt-4 grid grid-cols-1 gap-6 ${showChart ? "lg:grid-cols-12" : ""}`}>
        <div className={showChart ? "lg:col-span-4" : ""}>
          <p className="num-tabular text-3xl font-bold tracking-tight text-slate-900">
            {formatMetric(metric, total)}
          </p>
          <p className="text-xs text-slate-500">
            {rows.length} {periodNoun(view, rows.length)} · {agents.length}{" "}
            {agents.length === 1 ? "agent" : "agents"}
          </p>

          <ul
            className={`mt-4 grid gap-4 ${showChart ? "" : "gap-x-10 sm:grid-cols-2 lg:grid-cols-4"}`}
          >
            {sortedAgents.map((a) => {
              const share = total > 0 ? (valueOf(a) / total) * 100 : 0;
              return (
                <li key={a.agent}>
                  <div className="flex items-baseline justify-between gap-3">
                    <span className="flex items-center gap-2 text-sm font-medium text-slate-800">
                      <span
                        aria-hidden="true"
                        className="h-2.5 w-2.5 shrink-0 rounded-full"
                        style={{ backgroundColor: colorOf(a.agent) }}
                      />
                      {agentLabel(a.agent)}
                    </span>
                    <span className="num-tabular text-sm font-semibold text-slate-900">
                      {formatMetric(metric, valueOf(a))}
                    </span>
                  </div>
                  <p className="num-tabular mt-0.5 pl-4.5 text-xs text-slate-500">
                    {share.toFixed(1)}% of {metric === "cost" ? "spend" : "tokens"} ·{" "}
                    {metric === "cost"
                      ? `${formatCompactNumber(a.tokens)} tokens`
                      : formatMoney(a.cost)}
                  </p>
                </li>
              );
            })}
          </ul>
        </div>

        {showChart && (
          <div className="lg:col-span-8">
            <h3 className="text-sm font-semibold text-slate-800">{chartTitle}</h3>
            <div className="mt-2" style={{ height: 280 }}>
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={chartData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                  <CartesianGrid stroke="#f1f5f9" vertical={false} />
                  <XAxis
                    dataKey="name"
                    tick={{ fontSize: 11, fill: "#64748b" }}
                    axisLine={{ stroke: "#e2e8f0" }}
                    tickLine={false}
                    interval="preserveStartEnd"
                    minTickGap={24}
                    tickFormatter={(v: string) => formatAxisPeriod(view, v)}
                  />
                  <YAxis
                    tick={{ fontSize: 11, fill: "#64748b" }}
                    axisLine={false}
                    tickLine={false}
                    tickFormatter={(v: number) => formatAxisValue(metric, v)}
                    width={48}
                  />
                  <Tooltip
                    content={<AgentTooltip metric={metric} />}
                    cursor={{ stroke: "#cbd5e1", strokeWidth: 1 }}
                  />
                  {chartKeys.map((key) => (
                    <Area
                      key={key}
                      type="monotone"
                      dataKey={key}
                      name={agentLabel(key)}
                      stroke={colorOf(key)}
                      strokeWidth={2}
                      fill={colorOf(key)}
                      fillOpacity={0.1}
                      dot={chartData.length === 1 ? { r: 4, strokeWidth: 0, fill: colorOf(key), fillOpacity: 1 } : false}
                      activeDot={{ r: 4, stroke: "#ffffff", strokeWidth: 2 }}
                    />
                  ))}
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </div>
        )}
      </div>
    </section>
  );
}
