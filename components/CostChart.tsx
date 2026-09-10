"use client";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { CcusageRow } from "@/lib/ccusage";

export default function CostChart({ rows }: { rows: CcusageRow[] }) {
  const data = rows.slice(-30).map((r) => ({
    name: String(r.period ?? "").slice(0, 10),
    cost: Number((Number(r.totalCost ?? 0)).toFixed(2)),
    tokens: Number(r.totalTokens ?? 0),
  }));
  if (data.length === 0) return <p className="text-sm text-gray-500">No rows to chart.</p>;
  return (
    <section className="rounded-lg border border-gray-200 bg-white p-4">
      <h2 className="mb-2 font-semibold text-gray-900">Cost per period (last {data.length})</h2>
      <div style={{ height: 260 }}>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
            <XAxis dataKey="name" tick={{ fontSize: 11, fill: "#4b5563" }} axisLine={{ stroke: "#9ca3af" }} tickLine={{ stroke: "#9ca3af" }} interval="preserveStartEnd" />
            <YAxis tick={{ fontSize: 11, fill: "#4b5563" }} axisLine={{ stroke: "#9ca3af" }} tickLine={{ stroke: "#9ca3af" }} width={48} />
            <Tooltip contentStyle={{ backgroundColor: "#ffffff", border: "1px solid #e5e7eb", color: "#111827" }} labelStyle={{ color: "#111827" }} cursor={{ fill: "#eff6ff" }} />
            <Bar dataKey="cost" fill="#2563eb" name="Cost ($)" />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </section>
  );
}
