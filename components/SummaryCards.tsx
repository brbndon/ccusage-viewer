"use client";

import type { CcusageTotals } from "@/lib/ccusage";
import { formatCompactNumber, formatMoney } from "@/lib/model-meta";

interface SummaryCardsProps {
  totals: CcusageTotals;
  scannedAt: string;
  periodCount?: number;
}

export default function SummaryCards({
  totals,
  scannedAt,
  periodCount,
}: SummaryCardsProps) {
  const totalTokens = totals.totalTokens || 0;
  const inputTokens = totals.inputTokens || 0;
  const outputTokens = totals.outputTokens || 0;
  const cacheReadTokens = totals.cacheReadTokens || 0;
  const cacheCreationTokens = totals.cacheCreationTokens || 0;

  // Calculate percentages
  const cachePct = totalTokens > 0 ? (cacheReadTokens / totalTokens) * 100 : 0;
  const inputPct = totalTokens > 0 ? (inputTokens / totalTokens) * 100 : 0;
  const outputPct = totalTokens > 0 ? (outputTokens / totalTokens) * 100 : 0;
  const cacheCreatePct =
    totalTokens > 0 ? (cacheCreationTokens / totalTokens) * 100 : 0;

  // Cache hit rate: cache reads over prompt tokens (reads + inputs + creations)
  const promptTokens = cacheReadTokens + inputTokens + cacheCreationTokens;
  const cacheHitRate =
    promptTokens > 0 ? (cacheReadTokens / promptTokens) * 100 : 0;

  // Effective cost per million tokens
  const costPerMillion =
    totalTokens > 0 ? totals.totalCost / (totalTokens / 1_000_000) : 0;

  // Average cost per period
  const avgCostPerPeriod =
    periodCount && periodCount > 0 ? totals.totalCost / periodCount : null;

  return (
    <section aria-label="Usage Summary" className="flex flex-col gap-3">
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-12">
        {/* Financial Command Card */}
        <div className="flex flex-col justify-between rounded-xl border border-slate-200/80 bg-white p-5 shadow-xs lg:col-span-5">
          <div>
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                Total Spend
              </span>
              <div className="flex items-center gap-1.5 text-[11px] font-medium text-slate-400">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                <span>Scanned {new Date(scannedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
              </div>
            </div>

            <div className="mt-3 flex items-baseline gap-2">
              <span className="num-tabular text-3xl font-bold tracking-tight text-slate-900 sm:text-4xl">
                {formatMoney(totals.totalCost)}
              </span>
              <span className="text-xs font-medium text-slate-500">USD</span>
            </div>
          </div>

          <div className="mt-5 grid grid-cols-2 gap-3 border-t border-slate-100 pt-4">
            <div className="flex flex-col">
              <span className="text-[11px] font-medium text-slate-500">
                Effective Rate
              </span>
              <span className="num-tabular text-sm font-semibold text-slate-800">
                ${Number.isFinite(costPerMillion) ? costPerMillion.toFixed(3) : "0.000"}
                <span className="text-xs font-normal text-slate-500"> / Mtok</span>
              </span>
            </div>

            <div className="flex flex-col">
              <span className="text-[11px] font-medium text-slate-500">
                {periodCount ? `Avg / Period (${periodCount})` : "Avg / Period"}
              </span>
              <span className="num-tabular text-sm font-semibold text-slate-800">
                {avgCostPerPeriod !== null ? formatMoney(avgCostPerPeriod) : "—"}
              </span>
            </div>
          </div>
        </div>

        {/* Token Flow & Cache Telemetry Card */}
        <div className="flex flex-col justify-between rounded-xl border border-slate-200/80 bg-white p-5 shadow-xs lg:col-span-7">
          <div>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-baseline gap-2">
                <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                  Token Throughput
                </span>
                <span className="num-tabular text-xs text-slate-400">
                  ({totalTokens.toLocaleString("en-US")} total)
                </span>
              </div>

              {/* Cache Hit Efficiency Pill */}
              <div
                className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-semibold ${
                  cacheHitRate >= 80
                    ? "border border-emerald-200 bg-emerald-50 text-emerald-700"
                    : cacheHitRate >= 50
                    ? "border border-sky-200 bg-sky-50 text-sky-700"
                    : "border border-slate-200 bg-slate-50 text-slate-600"
                }`}
              >
                <span
                  className={`h-1.5 w-1.5 rounded-full ${
                    cacheHitRate >= 80
                      ? "bg-emerald-500"
                      : cacheHitRate >= 50
                      ? "bg-sky-500"
                      : "bg-slate-400"
                  }`}
                />
                <span>{cacheHitRate.toFixed(1)}% Cache Hit</span>
              </div>
            </div>

            <div className="mt-2 flex items-baseline gap-2">
              <span className="num-tabular text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">
                {formatCompactNumber(totalTokens)}
              </span>
              <span className="text-xs font-medium text-slate-500">tokens processed</span>
            </div>

            {/* Stacked Proportional Distribution Bar */}
            <div className="mt-3">
              <div
                role="img"
                aria-label={`Token breakdown: ${cachePct.toFixed(1)}% cache read, ${inputPct.toFixed(1)}% input, ${outputPct.toFixed(1)}% output, ${cacheCreatePct.toFixed(1)}% cache create`}
                className="flex h-2.5 w-full overflow-hidden rounded-full bg-slate-100"
              >
                {cachePct > 0 && (
                  <div
                    style={{ width: `${cachePct}%` }}
                    className="bg-emerald-500 transition-all duration-300"
                    title={`Cache Read: ${cachePct.toFixed(1)}%`}
                  />
                )}
                {inputPct > 0 && (
                  <div
                    style={{ width: `${inputPct}%` }}
                    className="bg-blue-500 transition-all duration-300"
                    title={`Input: ${inputPct.toFixed(1)}%`}
                  />
                )}
                {outputPct > 0 && (
                  <div
                    style={{ width: `${outputPct}%` }}
                    className="bg-purple-500 transition-all duration-300"
                    title={`Output: ${outputPct.toFixed(1)}%`}
                  />
                )}
                {cacheCreatePct > 0 && (
                  <div
                    style={{ width: `${cacheCreatePct}%` }}
                    className="bg-amber-500 transition-all duration-300"
                    title={`Cache Creation: ${cacheCreatePct.toFixed(1)}%`}
                  />
                )}
              </div>
            </div>
          </div>

          {/* Token Category Breakdown Grid */}
          <div className="mt-4 grid grid-cols-2 gap-2.5 border-t border-slate-100 pt-3 sm:grid-cols-4">
            <div className="flex flex-col">
              <div className="flex items-center gap-1.5 text-[11px] font-medium text-slate-500">
                <span className="h-2 w-2 rounded-xs bg-emerald-500" />
                <span>Cache Read</span>
              </div>
              <span className="num-tabular mt-0.5 text-sm font-semibold text-slate-800">
                {formatCompactNumber(cacheReadTokens)}
              </span>
              <span className="num-tabular text-[11px] text-slate-400">
                {cachePct.toFixed(1)}%
              </span>
            </div>

            <div className="flex flex-col">
              <div className="flex items-center gap-1.5 text-[11px] font-medium text-slate-500">
                <span className="h-2 w-2 rounded-xs bg-blue-500" />
                <span>Input</span>
              </div>
              <span className="num-tabular mt-0.5 text-sm font-semibold text-slate-800">
                {formatCompactNumber(inputTokens)}
              </span>
              <span className="num-tabular text-[11px] text-slate-400">
                {inputPct.toFixed(1)}%
              </span>
            </div>

            <div className="flex flex-col">
              <div className="flex items-center gap-1.5 text-[11px] font-medium text-slate-500">
                <span className="h-2 w-2 rounded-xs bg-purple-500" />
                <span>Output</span>
              </div>
              <span className="num-tabular mt-0.5 text-sm font-semibold text-slate-800">
                {formatCompactNumber(outputTokens)}
              </span>
              <span className="num-tabular text-[11px] text-slate-400">
                {outputPct.toFixed(1)}%
              </span>
            </div>

            <div className="flex flex-col">
              <div className="flex items-center gap-1.5 text-[11px] font-medium text-slate-500">
                <span className="h-2 w-2 rounded-xs bg-amber-500" />
                <span>Cache Create</span>
              </div>
              <span className="num-tabular mt-0.5 text-sm font-semibold text-slate-800">
                {formatCompactNumber(cacheCreationTokens)}
              </span>
              <span className="num-tabular text-[11px] text-slate-400">
                {cacheCreatePct.toFixed(1)}%
              </span>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
