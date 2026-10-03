"use client";

import { Fragment, useMemo, useState } from "react";
import type { CcusageRow, CcusageTotals, ViewKey } from "@/lib/ccusage";
import {
  agentLabel,
  periodLabel,
  periodNoun,
  projectPathOf,
  rowSortKey,
} from "@/lib/ccusage";
import {
  formatCompactNumber,
  formatMoney,
  parseModelMeta,
} from "@/lib/model-meta";

export function rowKey(r: CcusageRow, index: number): string {
  return `${r.period}::${r.agent}::${projectPathOf(r) ?? index}`;
}

type ModelSort = "cost" | "tokens" | "name";
type PeriodSort = "date-desc" | "date-asc" | "cost-desc";

export default function PeriodTable({
  rows,
  totals,
  view,
}: {
  rows: CcusageRow[];
  totals: CcusageTotals;
  view: ViewKey;
}) {
  const [openRow, setOpenRow] = useState<string | null>(null);
  const [modelSort, setModelSort] = useState<ModelSort>("cost");
  const [periodSort, setPeriodSort] = useState<PeriodSort>("date-desc");
  const [searchQuery, setSearchQuery] = useState("");
  const [showAllPeriods, setShowAllPeriods] = useState(false);

  // Model rollup calculation
  const modelRollup = useMemo(() => {
    const map = new Map<
      string,
      {
        tokens: number;
        cost: number;
        inputTokens: number;
        outputTokens: number;
        cacheReadTokens: number;
        cacheCreationTokens: number;
        costEstimated: boolean;
      }
    >();

    for (const r of rows) {
      for (const b of r.modelBreakdowns ?? []) {
        const entry = map.get(b.modelName) ?? {
          tokens: 0,
          cost: 0,
          inputTokens: 0,
          outputTokens: 0,
          cacheReadTokens: 0,
          cacheCreationTokens: 0,
          costEstimated: false,
        };
        const rowTok =
          b.inputTokens +
          b.outputTokens +
          b.cacheReadTokens +
          b.cacheCreationTokens;
        entry.tokens += rowTok;
        entry.cost += b.cost;
        entry.inputTokens += b.inputTokens;
        entry.outputTokens += b.outputTokens;
        entry.cacheReadTokens += b.cacheReadTokens;
        entry.cacheCreationTokens += b.cacheCreationTokens;
        entry.costEstimated ||= b.costEstimated === true;
        map.set(b.modelName, entry);
      }
    }

    const list = [...map.entries()].map(([name, stats]) => ({
      name,
      meta: parseModelMeta(name),
      ...stats,
      share: totals.totalCost > 0 ? (stats.cost / totals.totalCost) * 100 : 0,
      costPerMillion:
        stats.tokens > 0 ? stats.cost / (stats.tokens / 1_000_000) : 0,
    }));

    if (modelSort === "cost") {
      list.sort((a, b) => b.cost - a.cost);
    } else if (modelSort === "tokens") {
      list.sort((a, b) => b.tokens - a.tokens);
    } else if (modelSort === "name") {
      list.sort((a, b) => a.name.localeCompare(b.name));
    }

    return list;
  }, [rows, totals.totalCost, modelSort]);

  // Max cost among rows for spend intensity bar
  const maxRowCost = useMemo(() => {
    let max = 0;
    for (const r of rows) {
      if (r.totalCost > max) max = r.totalCost;
    }
    return max;
  }, [rows]);

  // Filtered and sorted periods
  const processedPeriods = useMemo(() => {
    let list = rows.map((r, i) => ({
      row: r,
      key: rowKey(r, i),
      isPeak: maxRowCost > 0 && r.totalCost === maxRowCost,
    }));

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      list = list.filter((item) => {
        const periodMatch =
          String(item.row.period).toLowerCase().includes(q) ||
          periodLabel(item.row, view).toLowerCase().includes(q);
        const modelMatch = (item.row.modelsUsed ?? []).some((m) =>
          m.toLowerCase().includes(q)
        );
        const projectMatch = projectPathOf(item.row)
          ?.toLowerCase()
          .includes(q);
        return periodMatch || modelMatch || projectMatch;
      });
    }

    if (periodSort === "date-desc") {
      list.sort((a, b) =>
        rowSortKey(b.row, view).localeCompare(rowSortKey(a.row, view))
      );
    } else if (periodSort === "date-asc") {
      list.sort((a, b) =>
        rowSortKey(a.row, view).localeCompare(rowSortKey(b.row, view))
      );
    } else if (periodSort === "cost-desc") {
      list.sort((a, b) => b.row.totalCost - a.row.totalCost);
    }

    return list;
  }, [rows, searchQuery, periodSort, maxRowCost, view]);

  const hasEstimatedCosts = modelRollup.some((m) => m.costEstimated);
  const visiblePeriods = showAllPeriods
    ? processedPeriods
    : processedPeriods.slice(0, 15);

  return (
    <section className="flex flex-col gap-6">
      {/* 1. Cost by Model Card */}
      <div className="rounded-xl border border-slate-200/80 bg-white p-5 shadow-xs">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 pb-3">
          <div>
            <h2 className="text-base font-semibold text-slate-900">
              Cost by Model
            </h2>
            <p className="text-xs text-slate-500">
              {modelRollup.length} models used across this scan
            </p>
          </div>

          <div className="flex items-center gap-1.5 text-xs text-slate-500">
            <span>Sort by:</span>
            <div className="inline-flex rounded-md border border-slate-200 bg-slate-50 p-0.5">
              <button
                type="button"
                onClick={() => setModelSort("cost")}
                className={`btn-press rounded px-2 py-0.5 font-medium transition-colors ${
                  modelSort === "cost"
                    ? "bg-white text-slate-900 shadow-xs"
                    : "text-slate-600 hover:text-slate-900"
                }`}
              >
                Cost
              </button>
              <button
                type="button"
                onClick={() => setModelSort("tokens")}
                className={`btn-press rounded px-2 py-0.5 font-medium transition-colors ${
                  modelSort === "tokens"
                    ? "bg-white text-slate-900 shadow-xs"
                    : "text-slate-600 hover:text-slate-900"
                }`}
              >
                Tokens
              </button>
              <button
                type="button"
                onClick={() => setModelSort("name")}
                className={`btn-press rounded px-2 py-0.5 font-medium transition-colors ${
                  modelSort === "name"
                    ? "bg-white text-slate-900 shadow-xs"
                    : "text-slate-600 hover:text-slate-900"
                }`}
              >
                Name
              </button>
            </div>
          </div>
        </div>

        {/* Models Table */}
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-slate-100 text-xs font-semibold uppercase tracking-wider text-slate-500">
                <th scope="col" className="py-3 pr-4">
                  Model & Provider
                </th>
                <th scope="col" className="py-3 pr-4">
                  Share of Spend
                </th>
                <th scope="col" className="py-3 text-right">
                  Tokens
                </th>
                <th scope="col" className="py-3 text-right">
                  Rate
                </th>
                <th scope="col" className="py-3 pl-4 text-right">
                  Total Cost
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {modelRollup.map((m) => (
                <tr
                  key={m.name}
                  className="group transition-colors hover:bg-slate-50/60"
                >
                  <td className="py-3 pr-4">
                    <div className="flex items-center gap-2">
                      <span
                        className={`inline-flex items-center rounded-sm border px-1.5 py-0.5 text-[11px] font-semibold ${m.meta.badgeClass}`}
                      >
                        {m.meta.provider}
                      </span>
                      <span
                        className="font-medium text-slate-800"
                        title={m.name}
                      >
                        {m.meta.displayName}
                      </span>
                    </div>
                  </td>

                  <td className="py-3 pr-4">
                    <div className="flex items-center gap-2">
                      <div className="h-2 w-20 overflow-hidden rounded-full bg-slate-100">
                        <div
                          style={{
                            width: `${Math.min(100, Math.max(0, m.share))}%`,
                            backgroundColor: m.meta.barColor,
                          }}
                          className="h-full rounded-full transition-all duration-300"
                        />
                      </div>
                      <span className="num-tabular text-xs font-medium text-slate-600">
                        {m.share.toFixed(1)}%
                      </span>
                    </div>
                  </td>

                  <td className="num-tabular py-3 text-right">
                    <span
                      className="font-medium text-slate-800"
                      title={`${m.tokens.toLocaleString()} tokens`}
                    >
                      {formatCompactNumber(m.tokens)}
                    </span>
                  </td>

                  <td className="num-tabular py-3 text-right text-xs text-slate-500">
                    ${m.costPerMillion.toFixed(2)}/M
                  </td>

                  <td
                    className="num-tabular py-3 pl-4 text-right font-bold text-slate-900"
                    title={m.costEstimated ? "Estimated: split from per-row cost by token share" : undefined}
                  >
                    {m.costEstimated ? "≈ " : ""}
                    {formatMoney(m.cost)}
                  </td>
                </tr>
              ))}

              {modelRollup.length === 0 && (
                <tr>
                  <td colSpan={5} className="py-6 text-center text-sm text-slate-500">
                    {view === "blocks"
                      ? "ccusage does not report per-model costs for billing blocks."
                      : "No model data found for the current query."}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        {hasEstimatedCosts && (
          <p className="mt-3 border-t border-slate-100 pt-3 text-xs text-slate-500">
            ≈ Estimated. Codex reports cost per {view === "session" ? "session" : "period"}, not per
            model, so model costs are split by token share. Scan with “All incl. slow”
            for exact per-model costs.
          </p>
        )}
      </div>

      {/* 2. Periods Activity Card */}
      <div className="rounded-xl border border-slate-200/80 bg-white p-5 shadow-xs">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 pb-3">
          <div>
            <h2 className="text-base font-semibold text-slate-900">
              Period Activity
            </h2>
            <p className="text-xs text-slate-500">
              Showing {visiblePeriods.length} of {processedPeriods.length}{" "}
              {periodNoun(view, processedPeriods.length)}
              {rows.length !== processedPeriods.length && ` (filtered from ${rows.length})`}
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {/* Search Input */}
            <input
              type="text"
              placeholder={view === "session" ? "Filter sessions…" : "Filter date or model…"}
              aria-label="Filter rows"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="rounded-md border border-slate-200 bg-white px-2.5 py-1 text-xs text-slate-800 placeholder-slate-400 focus:border-blue-500 focus:outline-hidden focus:ring-1 focus:ring-blue-500"
            />

            {/* Sort Toggle */}
            <div className="inline-flex rounded-md border border-slate-200 bg-slate-50 p-0.5 text-xs">
              <button
                type="button"
                onClick={() => setPeriodSort("date-desc")}
                className={`btn-press rounded px-2 py-0.5 font-medium transition-colors ${
                  periodSort === "date-desc"
                    ? "bg-white text-slate-900 shadow-xs"
                    : "text-slate-600 hover:text-slate-900"
                }`}
              >
                Newest
              </button>
              <button
                type="button"
                onClick={() => setPeriodSort("date-asc")}
                className={`btn-press rounded px-2 py-0.5 font-medium transition-colors ${
                  periodSort === "date-asc"
                    ? "bg-white text-slate-900 shadow-xs"
                    : "text-slate-600 hover:text-slate-900"
                }`}
              >
                Oldest
              </button>
              <button
                type="button"
                onClick={() => setPeriodSort("cost-desc")}
                className={`btn-press rounded px-2 py-0.5 font-medium transition-colors ${
                  periodSort === "cost-desc"
                    ? "bg-white text-slate-900 shadow-xs"
                    : "text-slate-600 hover:text-slate-900"
                }`}
              >
                Highest Cost
              </button>
            </div>
          </div>
        </div>

        {/* Periods Table */}
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-slate-100 text-xs font-semibold uppercase tracking-wider text-slate-500">
                <th scope="col" className="py-3 pr-4">
                  Period
                </th>
                <th scope="col" className="py-3 pr-4">
                  Models Used
                </th>
                <th scope="col" className="py-3 text-right">
                  Tokens
                </th>
                <th scope="col" className="py-3 pl-4 text-right">
                  Cost & Velocity
                </th>
                <th scope="col" className="py-3 text-right"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {visiblePeriods.map(({ row: r, key: k, isPeak }) => {
                const isOpen = openRow === k;
                const costIntensity =
                  maxRowCost > 0 ? (r.totalCost / maxRowCost) * 100 : 0;

                return (
                  <Fragment key={k}>
                    <tr
                      className={`group transition-colors hover:bg-slate-50/70 ${
                        isOpen ? "bg-slate-50/50" : ""
                      }`}
                    >
                      <td className="py-3 pr-4 font-medium text-slate-800">
                        <div className="flex items-center gap-1.5">
                          <span title={r.period}>{periodLabel(r, view)}</span>
                          {isPeak && (
                            <span className="rounded-full border border-amber-300 bg-amber-50 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-amber-800">
                              Peak
                            </span>
                          )}
                        </div>
                        {view === "session" && (
                          <div className="mt-0.5 max-w-64 truncate text-[11px] font-normal text-slate-500">
                            {agentLabel(r.agent)}
                            {projectPathOf(r) ? ` · ${projectPathOf(r)}` : ""}
                          </div>
                        )}
                      </td>

                      <td className="py-3 pr-4">
                        <div className="flex flex-wrap items-center gap-1">
                          {(r.modelsUsed ?? []).map((modelName) => {
                            const meta = parseModelMeta(modelName);
                            return (
                              <span
                                key={modelName}
                                className={`inline-flex items-center rounded-xs border px-1.5 py-0.5 text-[11px] font-medium ${meta.chipClass}`}
                                title={modelName}
                              >
                                {meta.displayName}
                              </span>
                            );
                          })}
                          {(r.modelsUsed ?? []).length === 0 && (
                            <span className="text-xs text-slate-400">—</span>
                          )}
                        </div>
                      </td>

                      <td className="num-tabular py-3 text-right">
                        <span
                          className="font-medium text-slate-800"
                          title={`${r.totalTokens.toLocaleString()} tokens`}
                        >
                          {formatCompactNumber(r.totalTokens)}
                        </span>
                      </td>

                      <td className="num-tabular py-3 pl-4 text-right">
                        <div className="flex items-center justify-end gap-2">
                          <div className="h-1.5 w-12 overflow-hidden rounded-full bg-slate-100">
                            <div
                              style={{ width: r.totalCost > 0 ? `${Math.max(4, costIntensity)}%` : "0%" }}
                              className={`h-full rounded-full ${
                                isPeak
                                  ? "bg-amber-500"
                                  : r.totalCost > 20
                                  ? "bg-blue-600"
                                  : "bg-slate-400"
                              }`}
                            />
                          </div>
                          <span
                            className={`font-semibold ${
                              isPeak
                                ? "text-amber-700"
                                : r.totalCost > 20
                                ? "text-slate-900"
                                : "text-slate-700"
                            }`}
                          >
                            {formatMoney(r.totalCost)}
                          </span>
                        </div>
                      </td>

                      <td className="py-3 pl-2 text-right">
                        <button
                          type="button"
                          aria-expanded={isOpen}
                          onClick={() => setOpenRow(isOpen ? null : k)}
                          className="btn-press rounded px-2 py-1 text-xs font-semibold text-blue-600 hover:bg-blue-50 hover:text-blue-800"
                        >
                          {isOpen ? "Close" : "Details"}
                        </button>
                      </td>
                    </tr>

                    {/* Expandable Model Breakdown Drawer */}
                    {isOpen && (
                      <tr className="bg-slate-50/70">
                        <td colSpan={5} className="p-4">
                          <div className="rounded-lg border border-slate-200 bg-white p-3 shadow-xs">
                            <div className="mb-2 flex items-center justify-between border-b border-slate-100 pb-2">
                              <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                                Model Breakdown for {periodLabel(r, view)}
                              </span>
                              {projectPathOf(r) && (
                                <span className="rounded bg-slate-100 px-2 py-0.5 font-mono text-xs text-slate-600">
                                  {projectPathOf(r)}
                                </span>
                              )}
                            </div>

                            <div className="overflow-x-auto">
                              <table className="w-full min-w-[640px] text-left text-xs">
                              <thead>
                                <tr className="border-b border-slate-100 font-semibold text-slate-500">
                                  <th scope="col" className="py-1.5 pr-2">Model</th>
                                  <th scope="col" className="py-1.5 text-right">Input</th>
                                  <th scope="col" className="py-1.5 text-right">Output</th>
                                  <th scope="col" className="py-1.5 text-right">Cache Create</th>
                                  <th scope="col" className="py-1.5 text-right">Cache Read</th>
                                  <th scope="col" className="py-1.5 pl-2 text-right">Cost</th>
                                </tr>
                              </thead>
                              <tbody className="divide-y divide-slate-100">
                                {(r.modelBreakdowns ?? []).length === 0 && (
                                  <tr>
                                    <td colSpan={6} className="py-3 text-center text-slate-500">
                                      ccusage does not report a per-model breakdown for this {periodNoun(view, 1)}.
                                    </td>
                                  </tr>
                                )}
                                {(r.modelBreakdowns ?? []).map((b) => {
                                  const meta = parseModelMeta(b.modelName);
                                  return (
                                    <tr key={`${b.agent ?? r.agent}::${b.modelName}`} className="hover:bg-slate-50/50">
                                      <td className="py-1.5 pr-2">
                                        <div className="flex items-center gap-1.5">
                                          {b.agent && r.agent === "all" && (
                                            <span className="text-[10px] font-semibold text-slate-500">
                                              {agentLabel(b.agent)}
                                            </span>
                                          )}
                                          <span
                                            className={`inline-flex rounded-xs border px-1 py-0.5 text-[10px] font-semibold ${meta.badgeClass}`}
                                          >
                                            {meta.provider}
                                          </span>
                                          <span className="font-medium text-slate-800">
                                            {meta.displayName}
                                          </span>
                                        </div>
                                      </td>
                                      <td className="num-tabular py-1.5 text-right text-slate-600">
                                        {formatCompactNumber(b.inputTokens)}
                                      </td>
                                      <td className="num-tabular py-1.5 text-right text-slate-600">
                                        {formatCompactNumber(b.outputTokens)}
                                      </td>
                                      <td className="num-tabular py-1.5 text-right text-slate-600">
                                        {formatCompactNumber(b.cacheCreationTokens)}
                                      </td>
                                      <td className="num-tabular py-1.5 text-right text-slate-600">
                                        {formatCompactNumber(b.cacheReadTokens)}
                                      </td>
                                      <td
                                        className="num-tabular py-1.5 pl-2 text-right font-semibold text-slate-900"
                                        title={b.costEstimated ? "Estimated: split from per-row cost by token share" : undefined}
                                      >
                                        {b.costEstimated ? "≈ " : ""}
                                        {formatMoney(b.cost)}
                                      </td>
                                    </tr>
                                  );
                                })}
                              </tbody>
                              </table>
                            </div>
                          </div>
                        </td>
                      </tr>
                    )}
                  </Fragment>
                );
              })}

              {visiblePeriods.length === 0 && (
                <tr>
                  <td colSpan={5} className="py-6 text-center text-sm text-slate-500">
                    No periods matched your filter criteria.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* Show More / Show Less Pagination Control */}
        {processedPeriods.length > 15 && (
          <div className="mt-4 flex items-center justify-center border-t border-slate-100 pt-3">
            <button
              type="button"
              onClick={() => setShowAllPeriods(!showAllPeriods)}
              className="btn-press rounded-md border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 shadow-xs hover:bg-slate-50"
            >
              {showAllPeriods
                ? `Show top 15 ${periodNoun(view, 15)}`
                : `View all ${processedPeriods.length} ${periodNoun(view, processedPeriods.length)}`}
            </button>
          </div>
        )}
      </div>
    </section>
  );
}
