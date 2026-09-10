"use client";
import { Fragment, useMemo, useState } from "react";
import type { CcusageRow, CcusageTotals } from "@/lib/ccusage";

export default function PeriodTable({ rows, totals }: { rows: CcusageRow[]; totals: CcusageTotals }) {
  const [open, setOpen] = useState<string | null>(null);
  const modelRollup = useMemo(() => {
    const m = new Map<string, { tokens: number; cost: number }>();
    for (const r of rows) for (const b of r.modelBreakdowns ?? []) {
      const e = m.get(b.modelName) ?? { tokens: 0, cost: 0 };
      e.tokens += b.inputTokens + b.outputTokens + b.cacheReadTokens + b.cacheCreationTokens;
      e.cost += b.cost;
      m.set(b.modelName, e);
    }
    return [...m.entries()].sort((a, b) => b[1].cost - a[1].cost);
  }, [rows]);

  return (
    <section className="flex flex-col gap-4">
      <div className="rounded-lg border border-gray-200 bg-white p-4">
        <h2 className="mb-2 font-semibold">Cost by model</h2>
        <table className="w-full text-sm">
          <thead><tr className="text-left text-gray-500"><th>Model</th><th className="text-right">Tokens</th><th className="text-right">Cost</th><th className="text-right">Share</th></tr></thead>
          <tbody>
            {modelRollup.map(([name, v]) => (
              <tr key={name} className="border-t"><td>{name}</td><td className="text-right">{v.tokens.toLocaleString()}</td><td className="text-right">${v.cost.toFixed(2)}</td><td className="text-right">{totals.totalCost ? `${((v.cost / totals.totalCost) * 100).toFixed(1)}%` : "—"}</td></tr>
            ))}
            {modelRollup.length === 0 && <tr><td colSpan={4} className="py-2 text-gray-500">No model data.</td></tr>}
          </tbody>
        </table>
      </div>
      <div className="rounded-lg border border-gray-200 bg-white p-4 overflow-auto">
        <h2 className="mb-2 font-semibold">Periods ({rows.length})</h2>
        <table className="w-full text-sm">
          <thead><tr className="text-left text-gray-500"><th>Period</th><th>Models</th><th className="text-right">Tokens</th><th className="text-right">Cost</th><th></th></tr></thead>
          <tbody>
            {rows.map((r) => (
              <Fragment key={r.period}>
                <tr className="border-t">
                  <td className="pr-2">{String(r.period).slice(0, 24)}</td>
                  <td className="pr-2 text-gray-600">{(r.modelsUsed ?? []).join(", ")}</td>
                  <td className="text-right">{r.totalTokens.toLocaleString()}</td>
                  <td className="text-right">${r.totalCost.toFixed(2)}</td>
                  <td className="text-right"><button className="underline" onClick={() => setOpen(open === r.period ? null : r.period)}>{open === r.period ? "hide" : "models"}</button></td>
                </tr>
                {open === r.period && (
                  <tr className="bg-gray-50">
                    <td colSpan={5} className="p-2 text-xs">
                      {(r.modelBreakdowns ?? []).map((b) => (
                        <div key={b.modelName}>{b.modelName}: in {b.inputTokens.toLocaleString()}, out {b.outputTokens.toLocaleString()}, cache-read {b.cacheReadTokens.toLocaleString()}, ${b.cost.toFixed(2)}</div>
                      ))}
                      {(r.metadata as { projectPath?: string } | undefined)?.projectPath && <div>project: {String((r.metadata as { projectPath?: string }).projectPath)}</div>}
                    </td>
                  </tr>
                )}
              </Fragment>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
