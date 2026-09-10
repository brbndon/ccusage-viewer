"use client";
import { Fragment, useMemo, useState } from "react";
import type { CcusageRow, CcusageTotals } from "@/lib/ccusage";

function projectPathOf(r: CcusageRow): string | undefined {
  const m = r.metadata as { projectPath?: unknown } | undefined;
  return typeof m?.projectPath === "string" ? m.projectPath : undefined;
}

export function rowKey(r: CcusageRow, index: number): string {
  return `${r.period}::${r.agent}::${projectPathOf(r) ?? index}`;
}

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
        <h2 className="mb-2 font-semibold text-gray-900">Cost by model</h2>
        <table className="w-full text-sm text-gray-900">
          <thead><tr className="text-left text-gray-500"><th scope="col">Model</th><th scope="col" className="text-right">Tokens</th><th scope="col" className="text-right">Cost</th><th scope="col" className="text-right">Share</th></tr></thead>
          <tbody>
            {modelRollup.map(([name, v]) => (
              <tr key={name} className="border-t"><td>{name}</td><td className="text-right">{v.tokens.toLocaleString()}</td><td className="text-right">${v.cost.toFixed(2)}</td><td className="text-right">{totals.totalCost ? `${((v.cost / totals.totalCost) * 100).toFixed(1)}%` : "—"}</td></tr>
            ))}
            {modelRollup.length === 0 && <tr><td colSpan={4} className="py-2 text-gray-500">No model data.</td></tr>}
          </tbody>
        </table>
      </div>
      <div className="rounded-lg border border-gray-200 bg-white p-4 overflow-auto">
        <h2 className="mb-2 font-semibold text-gray-900">Periods ({rows.length})</h2>
        <table className="w-full text-sm text-gray-900">
          <thead><tr className="text-left text-gray-500"><th scope="col">Period</th><th scope="col">Models</th><th scope="col" className="text-right">Tokens</th><th scope="col" className="text-right">Cost</th><th scope="col"></th></tr></thead>
          <tbody>
            {rows.map((r, i) => {
              const k = rowKey(r, i);
              const isOpen = open === k;
              return (
              <Fragment key={k}>
                <tr className="border-t">
                  <td className="pr-2">{String(r.period).slice(0, 24)}</td>
                  <td className="pr-2 text-gray-600">{(r.modelsUsed ?? []).join(", ")}</td>
                  <td className="text-right">{Number(r.totalTokens ?? 0).toLocaleString()}</td>
                  <td className="text-right">${Number(r.totalCost ?? 0).toFixed(2)}</td>
                  <td className="text-right"><button type="button" aria-expanded={isOpen} className="underline text-blue-700 hover:text-blue-900" onClick={() => setOpen(isOpen ? null : k)}>{isOpen ? "hide" : "models"}</button></td>
                </tr>
                {isOpen && (
                  <tr className="bg-gray-50">
                    <td colSpan={5} className="p-2 text-xs text-gray-700">
                      {(r.modelBreakdowns ?? []).map((b) => (
                        <div key={b.modelName}>{b.modelName}: in {b.inputTokens.toLocaleString()}, out {b.outputTokens.toLocaleString()}, cache-read {b.cacheReadTokens.toLocaleString()}, ${b.cost.toFixed(2)}</div>
                      ))}
                      {projectPathOf(r) && <div>project: {projectPathOf(r)}</div>}
                    </td>
                  </tr>
                )}
              </Fragment>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}
