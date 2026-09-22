"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import ScanControls from "@/components/ScanControls";
import ScanProgress, { formatElapsed } from "@/components/ScanProgress";
import SummaryCards from "@/components/SummaryCards";
import CostChart from "@/components/CostChart";
import PeriodTable from "@/components/PeriodTable";
import type {
  CcusageRow,
  CcusageTotals,
  ProviderSlug,
  ScanEngine,
  ScanResponse,
  ViewKey,
} from "@/lib/ccusage";
import { PROVIDERS, ZERO_TOTALS } from "@/lib/ccusage";
import { formatMoney, parseModelMeta } from "@/lib/model-meta";

/** Progress timer tick: 2 renders/sec keeps the elapsed readout alive without churning. */
const PROGRESS_TICK_MS = 500;

const DEFAULT_PROVIDERS: ProviderSlug[] = PROVIDERS.filter(
  (p) => p !== "antigravity"
);

function ScanSkeleton() {
  return (
    <div aria-hidden="true" className="flex flex-col gap-4">
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-12">
        <div className="scan-skeleton h-44 rounded-xl border border-slate-200/80 bg-white p-5 lg:col-span-5">
          <div className="h-4 w-28 rounded bg-slate-100" />
          <div className="mt-4 h-10 w-48 rounded bg-slate-100" />
          <div className="mt-8 grid grid-cols-2 gap-4 border-t border-slate-100 pt-4">
            <div className="h-8 rounded bg-slate-100" />
            <div className="h-8 rounded bg-slate-100" />
          </div>
        </div>
        <div className="scan-skeleton h-44 rounded-xl border border-slate-200/80 bg-white p-5 lg:col-span-7">
          <div className="flex justify-between">
            <div className="h-4 w-36 rounded bg-slate-100" />
            <div className="h-5 w-24 rounded-full bg-slate-100" />
          </div>
          <div className="mt-4 h-8 w-40 rounded bg-slate-100" />
          <div className="mt-3 h-2.5 w-full rounded-full bg-slate-100" />
          <div className="mt-6 grid grid-cols-4 gap-2 border-t border-slate-100 pt-3">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="h-8 rounded bg-slate-100" />
            ))}
          </div>
        </div>
      </div>
      <div className="scan-skeleton h-72 rounded-xl border border-slate-200/80 bg-white p-5">
        <div className="h-5 w-40 rounded bg-slate-100" />
        <div className="mt-4 h-52 rounded bg-slate-100" />
      </div>
    </div>
  );
}

export default function Home() {
  const [view, setView] = useState<ViewKey>("daily");
  const [since, setSince] = useState("");
  const [until, setUntil] = useState("");
  const [providers, setProviders] = useState<"all" | ProviderSlug[]>(
    DEFAULT_PROVIDERS
  );
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [data, setData] = useState<ScanResponse | null>(null);
  const [selectedModels, setSelectedModels] = useState<string[]>([]);
  const [elapsedSec, setElapsedSec] = useState(0);
  const [lastDurationSec, setLastDurationSec] = useState<number | null>(null);
  const [lastEngine, setLastEngine] = useState<ScanEngine | null>(null);

  const [scanQuery, setScanQuery] = useState<{
    view: ViewKey;
    since: string;
    until: string;
    providers: "all" | ProviderSlug[];
  }>({
    view: "daily",
    since: "",
    until: "",
    providers: DEFAULT_PROVIDERS,
  });

  const [announcement, setAnnouncement] = useState("");
  const abortRef = useRef<AbortController | null>(null);
  const reqIdRef = useRef(0);

  useEffect(() => () => abortRef.current?.abort(), []);

  useEffect(() => {
    if (!loading) return;
    const started = Date.now();
    const t = setInterval(
      () => setElapsedSec(Math.floor((Date.now() - started) / 1000)),
      PROGRESS_TICK_MS
    );
    return () => clearInterval(t);
  }, [loading]);

  function cancel() {
    abortRef.current?.abort();
  }

  async function scan() {
    abortRef.current?.abort();
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    const reqId = ++reqIdRef.current;
    const started = Date.now();
    setLoading(true);
    setElapsedSec(0);
    setError("");
    setAnnouncement("");
    setScanQuery({ view, since, until, providers });

    try {
      const q = new URLSearchParams({ view });
      if (since) q.set("since", since);
      if (until) q.set("until", until);
      if (providers === "all") {
        q.set("providers", "all");
      } else {
        q.set("providers", providers.join(","));
      }

      const res = await fetch(`/api/scan?${q.toString()}`, {
        signal: ctrl.signal,
      });
      const body = await res.json();
      if (!res.ok) {
        throw new Error(
          body?.detail
            ? `${body.error}: ${body.detail}`
            : (body?.error ?? "Scan failed")
        );
      }

      if (reqIdRef.current === reqId) {
        const done = body as ScanResponse;
        const durSec = Math.round((Date.now() - started) / 1000);
        setData(done);

        // Derive models in first-seen order and select all by default
        const modelsFromData: string[] = [];
        const seen = new Set<string>();
        for (const r of done.rows) {
          for (const m of r.modelsUsed ?? []) {
            if (!seen.has(m)) {
              seen.add(m);
              modelsFromData.push(m);
            }
          }
        }
        setSelectedModels(modelsFromData);

        setLastDurationSec(durSec);
        setLastEngine(done.engine ?? null);
        setAnnouncement(
          `${done.view} scan complete: ${done.rows.length} rows in ${formatElapsed(durSec)}, at ${new Date(done.scannedAt).toLocaleTimeString()}.`
        );
      }
    } catch (e) {
      if (e instanceof DOMException && e.name === "AbortError") return;
      if (reqIdRef.current === reqId) {
        setError(e instanceof Error ? e.message : "Scan failed");
      }
    } finally {
      if (reqIdRef.current === reqId) setLoading(false);
    }
  }

  // Derive model list from current loaded data
  const allModels = useMemo(() => {
    if (!data?.rows) return [];
    const seen = new Set<string>();
    const list: string[] = [];
    for (const r of data.rows) {
      for (const m of r.modelsUsed ?? []) {
        if (!seen.has(m)) {
          seen.add(m);
          list.push(m);
        }
      }
    }
    return list;
  }, [data]);

  // Compute spend stats per model for the model filter
  const modelStatsMap = useMemo(() => {
    if (!data?.rows) return new Map<string, { cost: number; share: number }>();
    const map = new Map<string, number>();
    let total = 0;
    for (const r of data.rows) {
      for (const b of r.modelBreakdowns ?? []) {
        map.set(b.modelName, (map.get(b.modelName) ?? 0) + b.cost);
        total += b.cost;
      }
    }
    const result = new Map<string, { cost: number; share: number }>();
    for (const [m, cost] of map.entries()) {
      result.set(m, {
        cost,
        share: total > 0 ? (cost / total) * 100 : 0,
      });
    }
    return result;
  }, [data]);

  // Apply model filter at render time only
  const { displayRows, displayTotals } = useMemo(() => {
    if (!data?.rows) {
      return { displayRows: [], displayTotals: ZERO_TOTALS };
    }

    if (selectedModels.length === 0) {
      return { displayRows: [], displayTotals: ZERO_TOTALS };
    }

    const allSelected =
      allModels.length > 0 &&
      allModels.length === selectedModels.length &&
      allModels.every((m) => selectedModels.includes(m));
    if (allSelected) {
      return { displayRows: data.rows, displayTotals: data.totals };
    }

    const selectedSet = new Set(selectedModels);
    const rows: CcusageRow[] = [];
    const totals: CcusageTotals = {
      totalCost: 0,
      totalTokens: 0,
      inputTokens: 0,
      outputTokens: 0,
      cacheCreationTokens: 0,
      cacheReadTokens: 0,
    };

    for (const r of data.rows) {
      const keptBreakdowns = (r.modelBreakdowns ?? []).filter((b) =>
        selectedSet.has(b.modelName)
      );
      const keptModelsUsed = (r.modelsUsed ?? []).filter((m) =>
        selectedSet.has(m)
      );

      if (keptBreakdowns.length === 0 && keptModelsUsed.length === 0) {
        continue;
      }

      let inTok = 0;
      let outTok = 0;
      let cacheCr = 0;
      let cacheRd = 0;
      let cost = 0;

      for (const b of keptBreakdowns) {
        inTok += b.inputTokens;
        outTok += b.outputTokens;
        cacheCr += b.cacheCreationTokens;
        cacheRd += b.cacheReadTokens;
        cost += b.cost;
      }

      const rowTotalTokens = inTok + outTok + cacheCr + cacheRd;
      const filteredRow: CcusageRow = {
        ...r,
        inputTokens: inTok,
        outputTokens: outTok,
        cacheCreationTokens: cacheCr,
        cacheReadTokens: cacheRd,
        totalTokens: rowTotalTokens,
        totalCost: cost,
        modelsUsed: keptModelsUsed,
        modelBreakdowns: keptBreakdowns,
      };

      rows.push(filteredRow);

      totals.totalCost += cost;
      totals.totalTokens += rowTotalTokens;
      totals.inputTokens += inTok;
      totals.outputTokens += outTok;
      totals.cacheCreationTokens += cacheCr;
      totals.cacheReadTokens += cacheRd;
    }

    return { displayRows: rows, displayTotals: totals };
  }, [data, selectedModels, allModels]);

  // Quick helper: Select top 80% spend models
  function selectTop80Spend() {
    const sorted = [...modelStatsMap.entries()].sort(
      (a, b) => b[1].cost - a[1].cost
    );
    let accumulated = 0;
    const top: string[] = [];
    for (const [name, stats] of sorted) {
      top.push(name);
      accumulated += stats.share;
      if (accumulated >= 80) break;
    }
    setSelectedModels(top.length > 0 ? top : [...allModels]);
  }

  const showEmptyHint = !data && !error && !loading;
  const showFirstScanSkeleton = loading && !data && !error;

  const isSlowScan =
    scanQuery.providers === "all" ||
    (Array.isArray(scanQuery.providers) &&
      scanQuery.providers.includes("antigravity"));

  return (
    <main className="mx-auto flex max-w-6xl flex-col gap-6 p-6">
      {/* Studio Header */}
      <header className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold tracking-tight text-slate-900">
              ccusage Studio
            </h1>
            <span className="rounded-md border border-slate-200 bg-white px-2 py-0.5 text-xs font-semibold text-slate-600 shadow-2xs">
              local
            </span>
          </div>
          <p className="text-xs text-slate-500">
            Scanning local LLM provider usage across models via <code>ccusage</code> CLI.
          </p>
        </div>

        {lastDurationSec !== null && !loading && (
          <div className="flex items-center gap-2 text-xs text-slate-500">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
            <span>Scan took {formatElapsed(lastDurationSec)}</span>
            {lastEngine && (
              <span className="rounded bg-slate-100 px-1.5 py-0.5 font-mono text-[11px] text-slate-600">
                {lastEngine.spec}
              </span>
            )}
          </div>
        )}
      </header>

      {/* Primary Scan Controls Card */}
      <ScanControls
        view={view}
        since={since}
        until={until}
        loading={loading}
        providers={providers}
        onViewChange={setView}
        onSinceChange={setSince}
        onUntilChange={setUntil}
        onProvidersChange={setProviders}
        onScan={scan}
      />

      {announcement && (
        <p role="status" className="sr-only">
          {announcement}
        </p>
      )}

      {loading && (
        <div className="relative [&_p.mt-2.text-xs.text-gray-500]:hidden">
          <ScanProgress
            view={scanQuery.view}
            since={scanQuery.since}
            until={scanQuery.until}
            elapsedSec={elapsedSec}
            hasPreviousData={data !== null && data.rows.length > 0}
            onCancel={cancel}
          />
          <p className="-mt-6 mb-4 px-4 text-xs text-slate-500 sm:ml-8">
            {isSlowScan
              ? "Full-history scans routinely take 60–120s while ccusage reads your local usage history — the wait is the history scan, not the download. You can keep browsing — results appear automatically."
              : "Provider-scoped scans usually finish in seconds."}
          </p>
        </div>
      )}

      {error && (
        <div
          role="alert"
          className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800 shadow-xs"
        >
          <p className="font-bold">Scan failed</p>
          <p className="mt-1 break-words text-xs text-red-700">{error}</p>
          <p className="mt-1 text-xs text-red-600">
            Long scans are normal (ccusage@latest can take 1–2 min). Try again —
            or narrow the range with Since/Until.
          </p>
          <button
            type="button"
            disabled={loading}
            onClick={scan}
            className="btn-press mt-2 rounded bg-red-600 px-3 py-1 text-xs font-semibold text-white shadow-2xs hover:bg-red-700 disabled:opacity-50"
          >
            Retry Scan
          </button>
        </div>
      )}

      {showEmptyHint && (
        <div className="rounded-xl border border-dashed border-slate-200 bg-white/60 p-8 text-center text-sm text-slate-500">
          Press <span className="font-semibold text-slate-800">Scan Usage</span> to load your {view} token usage and costs.
        </div>
      )}

      {showFirstScanSkeleton && <ScanSkeleton />}

      {data && !error && displayRows.length === 0 && !loading && (
        <p className="rounded-xl border border-slate-200 bg-white p-6 text-center text-sm text-slate-600 shadow-xs">
          No {view} data returned by ccusage (e.g. no active billing block). Try
          another view or date range.
        </p>
      )}

      {data && data.rows.length > 0 && (
        <div
          aria-busy={loading}
          className={
            loading
              ? "pointer-events-none select-none opacity-60 saturate-50"
              : undefined
          }
        >
          <div className="flex flex-col gap-6">
            {/* Model Filter Bar */}
            {allModels.length > 0 && (
              <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200/80 bg-white p-3.5 shadow-xs">
                <div className="flex items-center gap-3">
                  <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                    Filter Models:
                  </span>
                  <details className="relative">
                    <summary className="btn-press cursor-pointer select-none rounded-md border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 shadow-2xs hover:bg-slate-50">
                      Models ({selectedModels.length}/{allModels.length}) ▾
                    </summary>
                    <div className="absolute left-0 z-20 mt-1.5 max-h-80 min-w-[340px] overflow-auto rounded-xl border border-slate-200 bg-white p-3 shadow-xl">
                      <div className="mb-2 flex items-center justify-between border-b border-slate-100 pb-2 text-xs">
                        <div className="flex gap-2">
                          <button
                            type="button"
                            onClick={() => setSelectedModels([...allModels])}
                            className="btn-press font-semibold text-blue-600 hover:text-blue-800"
                          >
                            Select all
                          </button>
                          <span>·</span>
                          <button
                            type="button"
                            onClick={selectTop80Spend}
                            className="btn-press font-semibold text-blue-600 hover:text-blue-800"
                            title="Select models contributing to top 80% of costs"
                          >
                            Top 80% spend
                          </button>
                        </div>
                        <button
                          type="button"
                          onClick={() => setSelectedModels([])}
                          className="btn-press font-medium text-slate-500 hover:text-slate-800"
                        >
                          Clear
                        </button>
                      </div>

                      <div className="flex flex-col gap-1 text-xs">
                        {allModels.map((m) => {
                          const isChecked = selectedModels.includes(m);
                          const meta = parseModelMeta(m);
                          const stats = modelStatsMap.get(m);
                          return (
                            <label
                              key={m}
                              className="flex cursor-pointer items-center justify-between rounded-md px-2 py-1.5 transition-colors hover:bg-slate-50"
                            >
                              <div className="flex items-center gap-2 overflow-hidden pr-2">
                                <input
                                  type="checkbox"
                                  checked={isChecked}
                                  onChange={(e) => {
                                    if (e.target.checked) {
                                      setSelectedModels((prev) => [...prev, m]);
                                    } else {
                                      setSelectedModels((prev) =>
                                        prev.filter((x) => x !== m)
                                      );
                                    }
                                  }}
                                  className="rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                                />
                                <span
                                  className={`rounded-xs border px-1 py-0.5 text-[10px] font-semibold ${meta.badgeClass}`}
                                >
                                  {meta.provider}
                                </span>
                                <span
                                  className="truncate font-medium text-slate-800"
                                  title={m}
                                >
                                  {meta.displayName}
                                </span>
                              </div>

                              {stats && (
                                <span className="num-tabular shrink-0 text-[11px] font-medium text-slate-500">
                                  {formatMoney(stats.cost)} ({stats.share.toFixed(0)}%)
                                </span>
                              )}
                            </label>
                          );
                        })}
                      </div>
                    </div>
                  </details>
                </div>

                <div className="flex items-center gap-2 text-xs text-slate-500">
                  <span>
                    {selectedModels.length} of {allModels.length} models active
                  </span>
                  {selectedModels.length < allModels.length && (
                    <button
                      type="button"
                      onClick={() => setSelectedModels([...allModels])}
                      className="btn-press font-semibold text-blue-600 hover:underline"
                    >
                      (Reset filter)
                    </button>
                  )}
                </div>
              </div>
            )}

            {/* Core Observability Views */}
            {displayRows.length > 0 && (
              <>
                <SummaryCards
                  totals={displayTotals}
                  scannedAt={data.scannedAt}
                  periodCount={displayRows.length}
                />
                <CostChart rows={displayRows} />
                <PeriodTable rows={displayRows} totals={displayTotals} />
              </>
            )}

            {/* Diagnostic Raw Output */}
            <details className="text-xs text-slate-400">
              <summary className="cursor-pointer select-none hover:text-slate-600">
                Raw Scanner Output
              </summary>
              <pre className="mt-2 overflow-auto rounded-xl border border-slate-200 bg-white p-4 font-mono text-xs text-slate-700 shadow-2xs">
                {JSON.stringify(data, null, 2).slice(0, 8000)}
              </pre>
            </details>
          </div>
        </div>
      )}
    </main>
  );
}
