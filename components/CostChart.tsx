"use client";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { CcusageRow } from "@/lib/ccusage";

export default function CostChart({ rows }: { rows: CcusageRow[] }) {
  const data = rows.slice(-30).map((r) => ({
    name: String(r.period).slice(0, 10),
    cost: Number(r.totalCost.toFixed(2)),
    tokens: r.totalTokens,
  }));
  if (data.length === 0) return <p className="text-sm text-gray-500">No rows to chart.</p>;
  return (
    <section className="rounded-lg border border-gray-200 bg-white p-4">
      <h2 className="mb-2 font-semibold">Cost per period (last {data.length})</h2>
      <div style={{ height: 260 }}>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="name" tick={{ fontSize: 11 }} interval="preserveStartEnd" />
            <YAxis tick={{ fontSize: 11 }} />
            <Tooltip />
            <Bar dataKey="cost" fill="#2563eb" name="Cost ($)" />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </section>
  );
}
