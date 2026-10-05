"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import ScanControls from "@/components/ScanControls";
import ScanProgress, { formatElapsed } from "@/components/ScanProgress";
import SummaryCards from "@/components/SummaryCards";
import CostChart from "@/components/CostChart";
import ExportActions from "@/components/ExportActions";
import AgentBreakdown from "@/components/AgentBreakdown";
import PeriodTable from "@/components/PeriodTable";
import type {
  CcusageRow,
  ProviderSlug,
  ScanEngine,
  ScanResponse,
  ViewKey,
} from "@/lib/ccusage";
import {
  isProviderSlug,
  isViewKey,
  isViewSupportedByProviders,
  PROVIDERS,
  ZERO_TOTALS,
  filterRowsByModels,
  totalsFromRows,
  unallocatedModelUsage,
} from "@/lib/ccusage";
import { formatChartMoney, formatMoney, parseModelMeta } from "@/lib/model-meta";

/** Progress timer tick: 2 renders/sec keeps the elapsed readout alive without churning. */
const PROGRESS_TICK_MS = 500;

const DEFAULT_PROVIDERS: ProviderSlug[] = PROVIDERS.filter(
  (p) => p !== "antigravity"
);
const PREFERENCES_KEY = "ccusage-viewer.preferences.v1";

interface SavedPreferences {
  view: ViewKey;
  providers: "all" | ProviderSlug[];
}

function readPreferences(): SavedPreferences | null {
  try {
    const raw = window.localStorage.getItem(PREFERENCES_KEY);
    if (!raw) return null;

    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== "object" || parsed === null) return null;
    const value = parsed as Record<string, unknown>;
    if (value.version !== 1 || typeof value.view !== "string" || !isViewKey(value.view)) {
      return null;
    }

    if (value.providers === "all") {
      return { view: value.view, providers: "all" };
    }
    if (
      Array.isArray(value.providers) &&
      value.providers.every((provider) => typeof provider === "string" && isProviderSlug(provider))
    ) {
      return { view: value.view, providers: value.providers };
    }
  } catch {
    // Preferences are optional; ignore unavailable storage or malformed JSON.
  }
  return null;
}

/** Model names in first-seen order, taken from per-model breakdowns (the only data the filter can split). */
function breakdownModels(rows: CcusageRow[]): string[] {
  const seen = new Set<string>();
  for (const r of rows) {
    for (const b of r.modelBreakdowns ?? []) seen.add(b.modelName);
  }
  return [...seen];
}

function describeRange(since: string, until: string): string {
  if (!since && !until) return "All history";
  return `${since || "Any start"} → ${until || "Latest"}`;
}

function describeProviders(providerList?: string[]): string {
  if (!providerList?.length) return "Unknown providers";
  return providerList.includes("all") ? "All providers" : providerList.join(", ");
}

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
  const [preferencesLoaded, setPreferencesLoaded] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [scanCancelled, setScanCancelled] = useState(false);
  const [data, setData] = useState<ScanResponse | null>(null);
  const [selectedModels, setSelectedModels] = useState<string[]>([]);
  const [elapsedSec, setElapsedSec] = useState(0);
  const [lastDurationSec, setLastDurationSec] = useState<number | null>(null);
  const [lastEngine, setLastEngine] = useState<ScanEngine | null>(null);
  const [lastSuccessfulRange, setLastSuccessfulRange] = useState({ since: "", until: "" });
  const [rawOutputOpen, setRawOutputOpen] = useState(false);

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
  const modelFilterRef = useRef<HTMLDetailsElement>(null);

  useEffect(() => () => abortRef.current?.abort(), []);

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => {
      const saved = readPreferences();
      if (saved) {
        setView(saved.view);
        setProviders(saved.providers);
      }
      setPreferencesLoaded(true);
    });
    return () => window.cancelAnimationFrame(frame);
  }, []);

  useEffect(() => {
    if (!preferencesLoaded) return;
    try {
      window.localStorage.setItem(
        PREFERENCES_KEY,
        JSON.stringify({ version: 1, view, providers })
      );
    } catch {
      // Preferences are optional; storage can be disabled or full.
    }
  }, [preferencesLoaded, providers, view]);

  useEffect(() => {
    function closeOnOutsidePointer(event: PointerEvent) {
      const details = modelFilterRef.current;
      if (!details) return;
      if (details.open && event.target instanceof Node && !details.contains(event.target)) {
        details.open = false;
      }
    }

    function closeOnEscape(event: KeyboardEvent) {
      const details = modelFilterRef.current;
      if (!details) return;
      if (event.key !== "Escape" || !details.open) return;
      event.preventDefault();
      details.open = false;
      details.querySelector("summary")?.focus();
    }

    document.addEventListener("pointerdown", closeOnOutsidePointer);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("pointerdown", closeOnOutsidePointer);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, []);

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
    setScanCancelled(true);
    setAnnouncement(
      data ? "Scan cancelled. The previous scan is unchanged." : "Scan cancelled."
    );
    abortRef.current?.abort();
  }

  const scan = useCallback(async () => {
    abortRef.current?.abort();
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    const reqId = ++reqIdRef.current;
    const started = Date.now();
    setLoading(true);
    setElapsedSec(0);
    setError("");
    setScanCancelled(false);
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

        // Select every model by default
        setSelectedModels(breakdownModels(done.rows));

        setLastDurationSec(durSec);
        setLastEngine(done.engine ?? null);
        setLastSuccessfulRange({ since, until });
        setScanCancelled(false);
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
  }, [providers, since, until, view]);

  useEffect(() => {
    function handleScanShortcut(event: KeyboardEvent) {
      if (
        !(event.metaKey || event.ctrlKey) ||
        event.altKey ||
        event.shiftKey ||
        (event.key !== "Enter" && event.key !== "NumpadEnter")
      ) {
        return;
      }

      const target = event.target instanceof HTMLElement ? event.target : null;
      if (target?.closest("input:not([type='date']), textarea, select, [contenteditable='true']")) {
        return;
      }

      const canScan = providers === "all" || isViewSupportedByProviders(view, providers);
      if (loading || !canScan) return;

      event.preventDefault();
      void scan();
    }

    window.addEventListener("keydown", handleScanShortcut);
    return () => window.removeEventListener("keydown", handleScanShortcut);
  }, [loading, providers, scan, view]);

  // Derive model list from current loaded data
  const allModels = useMemo(() => breakdownModels(data?.rows ?? []), [data]);

  // Compute spend stats per model for the model filter
  const modelStatsMap = useMemo(() => {
    type ModelStats = { cost: number; share: number; estimated: boolean };
    if (!data?.rows) return new Map<string, ModelStats>();
    const map = new Map<string, ModelStats>();
    let total = 0;
    for (const r of data.rows) {
      for (const b of r.modelBreakdowns ?? []) {
        const entry = map.get(b.modelName) ?? { cost: 0, share: 0, estimated: false };
        entry.cost += b.cost;
        entry.estimated ||= b.costEstimated === true;
        map.set(b.modelName, entry);
        total += b.cost;
      }
    }
    for (const entry of map.values()) {
      entry.share = total > 0 ? (entry.cost / total) * 100 : 0;
    }
    return map;
  }, [data]);

  // Apply model filter at render time only
  const { displayRows, displayTotals } = useMemo(() => {
    if (!data?.rows) {
      return { displayRows: [], displayTotals: ZERO_TOTALS };
    }

    if (allModels.length === 0) {
      return { displayRows: data.rows, displayTotals: data.totals };
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

    const rows = filterRowsByModels(data.rows, new Set(selectedModels));
    return { displayRows: rows, displayTotals: totalsFromRows(rows) };
  }, [data, selectedModels, allModels]);

  const modelFilterApplied = allModels.length > 0 && selectedModels.length < allModels.length;
  const excludedModelUsage = useMemo(() => totalsFromRows(
    (data?.rows ?? []).flatMap(unallocatedModelUsage)
  ), [data]);

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
  const showNoScanRows = !!data && data.rows.length === 0 && !error && !loading;
  const showNoModelsSelected =
    !!data &&
    data.rows.length > 0 &&
    allModels.length > 0 &&
    selectedModels.length === 0 &&
    !loading;

  // Cap the raw panel; stringifying is skipped entirely until it is opened.
  const rawOutput = useMemo(
    () => (rawOutputOpen && data ? JSON.stringify(data, null, 2).slice(0, 8000) : ""),
    [data, rawOutputOpen]
  );

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

        {scanCancelled && !loading ? (
          <div role="status" className="text-xs font-medium text-amber-700">
            {data ? "Scan cancelled · previous scan kept" : "Scan cancelled"}
          </div>
        ) : lastDurationSec !== null && !loading ? (
          <div className="flex items-center gap-2 text-xs text-slate-500">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
            <span>Scan took {formatElapsed(lastDurationSec)}</span>
            {lastEngine && (
              <span className="rounded bg-slate-100 px-1.5 py-0.5 font-mono text-[11px] text-slate-600">
                {lastEngine.spec}
              </span>
            )}
          </div>
        ) : null}
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
        onDateRangeChange={(nextSince, nextUntil) => {
          setSince(nextSince);
          setUntil(nextUntil);
        }}
        onProvidersChange={setProviders}
        onScan={scan}
      />

      {announcement && (
        <p role="status" className="sr-only">
          {announcement}
        </p>
      )}

      {loading && (
        <div>
          <ScanProgress
            view={scanQuery.view}
            since={scanQuery.since}
            until={scanQuery.until}
            elapsedSec={elapsedSec}
            hasPreviousData={data !== null && data.rows.length > 0}
            reassurance={isSlowScan
              ? "Full-history scans can take 60–120s while ccusage reads local usage history. You can keep using the page while this runs."
              : "Provider-scoped scans usually finish in seconds. You can keep using the page while this runs."}
            onCancel={cancel}
          />
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
            Full-history scans can take a while. Try again, or narrow the range
            with Since/Until.
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

      {data?.warnings && data.warnings.length > 0 && !loading && (
        <div
          role="status"
          className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900 shadow-xs"
        >
          <p className="font-bold">
            Partial results: {data.warnings.length} provider
            {data.warnings.length === 1 ? "" : "s"} failed and{" "}
            {data.warnings.length === 1 ? "is" : "are"} not included
          </p>
          <ul className="mt-1 flex flex-col gap-0.5 text-xs text-amber-800">
            {data.warnings.map((w) => (
              <li key={w.provider} className="break-words">
                <span className="font-semibold">{w.provider}</span>: {w.error}
              </li>
            ))}
          </ul>
        </div>
      )}

      {showEmptyHint && (
        <div className="rounded-xl border border-dashed border-slate-200 bg-white/60 p-8 text-center text-sm text-slate-500">
          <span className="font-semibold text-slate-800">Scan Usage</span> runs the local ccusage CLI for your selected providers and date range, then shows {view} usage, costs, and trends here.
        </div>
      )}

      {showFirstScanSkeleton && <ScanSkeleton />}

      {showNoScanRows && (
        <p role="status" className="rounded-xl border border-slate-200 bg-white p-6 text-center text-sm text-slate-600 shadow-xs">
          No {data.view} usage rows were returned for {describeRange(lastSuccessfulRange.since, lastSuccessfulRange.until)}. Try another view or date range.
        </p>
      )}

      {showNoModelsSelected && (
        <div className="flex flex-wrap items-center justify-center gap-3 rounded-xl border border-slate-200 bg-white p-6 text-center text-sm text-slate-600 shadow-xs">
          <span aria-live="polite">No models are selected, so the results are hidden.</span>
          <button
            type="button"
            onClick={() => setSelectedModels([...allModels])}
            className="btn-press rounded-md border border-blue-200 bg-blue-50 px-3 py-1.5 text-xs font-semibold text-blue-800 hover:bg-blue-100"
          >
            Select all models
          </button>
        </div>
      )}

      {data && data.rows.length > 0 && (
        <div
          aria-busy={loading}
          className={
            loading
              ? "opacity-60 saturate-50"
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
                  <details ref={modelFilterRef} className="relative">
                    <summary className="btn-press cursor-pointer select-none rounded-md border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 shadow-2xs hover:bg-slate-50">
                      Models ({selectedModels.length}/{allModels.length}) ▾
                    </summary>
                    <div className="absolute left-0 z-20 mt-1.5 max-h-80 w-[min(22rem,calc(100vw-3rem))] overflow-auto rounded-xl border border-slate-200 bg-white p-3 shadow-xl">
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
                                <span
                                  className="num-tabular shrink-0 text-[11px] font-medium text-slate-500"
                                  title={stats.estimated ? "Estimated: split from per-row cost by token share" : undefined}
                                >
                                  {stats.estimated ? "≈ " : ""}
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

                <div className="flex flex-wrap items-center justify-end gap-3">
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
                        Reset filter
                      </button>
                    )}
                  </div>
                  {displayRows.length > 0 && data && (
                    <ExportActions
                      rows={displayRows}
                      totals={displayTotals}
                      view={data.view}
                      scannedAt={data.scannedAt}
                      rangeLabel={describeRange(lastSuccessfulRange.since, lastSuccessfulRange.until)}
                      providersLabel={describeProviders(data.providers)}
                      includedProvidersLabel={describeProviders(data.providers?.filter((p) => !data.warnings?.some((w) => w.provider === p)))}
                      warnings={data.warnings}
                      modelFilterApplied={modelFilterApplied}
                      excludedModelUsage={excludedModelUsage}
                    />
                  )}
                </div>
              </div>
            )}

            {allModels.length > 0 && (
              <p className="-mt-3 text-xs text-slate-500">
                Showing {data.view} results · {describeProviders(data.providers)} · {describeRange(lastSuccessfulRange.since, lastSuccessfulRange.until)}
              </p>
            )}

            {allModels.length === 0 && displayRows.length > 0 && (
              <div className="flex justify-end">
                <ExportActions
                  rows={displayRows}
                  totals={displayTotals}
                  view={data.view}
                  scannedAt={data.scannedAt}
                  rangeLabel={describeRange(lastSuccessfulRange.since, lastSuccessfulRange.until)}
                  providersLabel={describeProviders(data.providers)}
                  includedProvidersLabel={describeProviders(data.providers?.filter((p) => !data.warnings?.some((w) => w.provider === p)))}
                  warnings={data.warnings}
                  modelFilterApplied={modelFilterApplied}
                  excludedModelUsage={excludedModelUsage}
                />
              </div>
            )}

            {/* Core Observability Views */}
            {modelFilterApplied && (excludedModelUsage.totalTokens > 0 || excludedModelUsage.totalCost > 0) && (
              <p role="status" className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900">
                Model filter excludes {excludedModelUsage.totalTokens.toLocaleString("en-US")} tokens
                and {formatChartMoney(excludedModelUsage.totalCost)} that ccusage cannot attribute to a model.
              </p>
            )}
            {displayRows.length > 0 && (
              <>
                <SummaryCards
                  totals={displayTotals}
                  scannedAt={data.scannedAt}
                  periodCount={displayRows.length}
                />
                <AgentBreakdown rows={displayRows} view={data.view} />
                <CostChart rows={displayRows} view={data.view} />
                <PeriodTable rows={displayRows} totals={displayTotals} view={data.view} />
              </>
            )}

            {/* Diagnostic Raw Output */}
            <details
              className="text-xs text-slate-400"
              onToggle={(e) => setRawOutputOpen(e.currentTarget.open)}
            >
              <summary className="cursor-pointer select-none hover:text-slate-600">
                Raw Scanner Output
              </summary>
              <pre className="mt-2 overflow-auto rounded-xl border border-slate-200 bg-white p-4 font-mono text-xs text-slate-700 shadow-2xs">
                {rawOutput}
              </pre>
            </details>
          </div>
        </div>
      )}
    </main>
  );
}
