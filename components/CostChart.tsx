"use client";

import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { CcusageRow } from "@/lib/ccusage";
import { formatCompactNumber, formatMoney } from "@/lib/model-meta";

function formatChartMoney(amount: number): string {
  if (!Number.isFinite(amount) || Math.abs(amount) >= 0.01) {
    return formatMoney(amount);
  }

  const formatted = Math.abs(amount).toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 8,
  });
  return amount < 0 ? `-$${formatted}` : `$${formatted}`;
}

interface TooltipPayloadItem {
  value: number;
  payload: {
    name: string;
    cost: number;
    tokens: number;
  };
}

function CustomTooltip({
  active,
  payload,
  label,
}: {
  active?: boolean;
  payload?: TooltipPayloadItem[];
  label?: string;
}) {
  if (!active || !payload || !payload.length) return null;
  const data = payload[0].payload;

  return (
    <div className="rounded-lg border border-slate-200 bg-slate-900 px-3 py-2 text-xs shadow-lg">
      <p className="font-semibold text-slate-100">{label}</p>
      <div className="mt-1 flex items-center justify-between gap-4">
        <span className="text-slate-400">Cost:</span>
        <span className="num-tabular font-bold text-emerald-400">
          {formatChartMoney(data.cost)}
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

export default function CostChart({ rows }: { rows: CcusageRow[] }) {
  const chartedRows = rows.slice(-30);
  const data = chartedRows.map((r) => ({
    name: String(r.period ?? "").slice(0, 10),
    cost: Number(r.totalCost ?? 0),
    tokens: Number(r.totalTokens ?? 0),
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

  return (
    <section aria-labelledby="cost-timeline-heading" className="rounded-xl border border-slate-200/80 bg-white p-5 shadow-xs">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 pb-3">
        <div>
          <h2 id="cost-timeline-heading" className="text-base font-semibold text-slate-900">
            Cost Timeline
          </h2>
          <p className="text-xs text-slate-500">
            Spend trends across the last {data.length} periods
          </p>
        </div>

        <div className="flex items-center gap-3 text-xs">
          <div className="flex items-center gap-1.5">
            <span className="text-slate-400">Avg:</span>
            <span className="num-tabular font-semibold text-slate-700">
              {formatChartMoney(avg)}
            </span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="text-slate-400">Peak:</span>
            <span className="num-tabular font-semibold text-amber-600">
              {formatChartMoney(peak)}
            </span>
          </div>
        </div>
      </div>

      <div style={{ height: 260 }}>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} margin={{ top: 10, right: 10, left: -10, bottom: 0 }}>
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
            <Tooltip content={<CustomTooltip />} cursor={{ fill: "#f8fafc" }} />
            <Bar
              dataKey="cost"
              fill="#2563eb"
              radius={[4, 4, 0, 0]}
              name="Cost"
            />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </section>
  );
}
