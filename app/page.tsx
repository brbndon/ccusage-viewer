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

/** Progress timer tick: 2 renders/sec keeps the elapsed readout alive without churning. */
const PROGRESS_TICK_MS = 500;

const DEFAULT_PROVIDERS: ProviderSlug[] = PROVIDERS.filter(
  (p) => p !== "antigravity"
);

function ScanSkeleton() {
  return (
    <div aria-hidden="true" className="flex flex-col gap-4">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-6">
        {Array.from({ length: 6 }).map((_, i) => (
          <div
            key={i}
            className="scan-skeleton rounded-lg border border-gray-200 bg-gray-100 p-3"
          >
            <div className="h-3 w-2/3 rounded bg-gray-200" />
            <div className="mt-2 h-5 w-1/2 rounded bg-gray-200" />
          </div>
        ))}
      </div>
      <div className="scan-skeleton rounded-lg border border-gray-200 bg-gray-100 p-4">
        <div className="h-4 w-48 rounded bg-gray-200" />
        <div className="mt-3 h-40 rounded bg-gray-200" />
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

  const showEmptyHint = !data && !error && !loading;
  const showFirstScanSkeleton = loading && !data && !error;

  const isSlowScan =
    scanQuery.providers === "all" ||
    (Array.isArray(scanQuery.providers) &&
      scanQuery.providers.includes("antigravity"));

  return (
    <main className="mx-auto flex max-w-6xl flex-col gap-6 p-6">
      <header>
        <h1 className="text-2xl font-bold text-gray-900">ccusage Viewer</h1>
        <p className="text-sm text-gray-600">
          Runs <code>npx --yes ccusage@latest {"<view>"} --json</code> on this
          Mac. Local dev only.
          <span className="ml-2 text-gray-500">
            Default scan excludes antigravity (~108s empty scan).
          </span>
          {lastDurationSec !== null && !loading && (
            <span className="ml-2 text-gray-500">
              · Last scan took {formatElapsed(lastDurationSec)}
              {lastEngine
                ? ` · ${lastEngine.spec}${lastEngine.pinned ? " (registry latest)" : " (cached — registry unreachable)"}`
                : ""}
              .
            </span>
          )}
        </p>
      </header>

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
          <p className="-mt-6 mb-4 px-4 text-xs text-gray-500 sm:ml-8">
            {isSlowScan
              ? "Full-history scans routinely take 60–120s while ccusage reads your local usage history — the wait is the history scan, not the download. You can keep browsing — results appear automatically."
              : "Provider-scoped scans usually finish in seconds."}
          </p>
        </div>
      )}

      {error && (
        <div
          role="alert"
          className="rounded border border-red-300 bg-red-50 p-3 text-sm text-red-800"
        >
          <p className="font-semibold">Scan failed</p>
          <p className="mt-1 break-words">{error}</p>
          <p className="mt-1 text-red-700">
            Long scans are normal (ccusage@latest can take 1–2 min). Try again —
            or narrow the range with Since/Until.
          </p>
          <button
            type="button"
            disabled={loading}
            onClick={scan}
            className="mt-2 font-semibold underline disabled:opacity-50"
          >
            Retry
          </button>
        </div>
      )}

      {showEmptyHint && (
        <p className="text-sm text-gray-500">
          Press Scan to load {view} usage.
        </p>
      )}

      {showFirstScanSkeleton && <ScanSkeleton />}

      {data && !error && displayRows.length === 0 && !loading && (
        <p className="rounded border border-gray-200 bg-gray-50 p-3 text-sm text-gray-600">
          No {view} data returned by ccusage (e.g. no active billing block). Try
          another view.
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
            {allModels.length > 0 && (
              <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-gray-200 bg-white p-3">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-semibold text-gray-700">
                    Filter models:
                  </span>
                  <details className="relative">
                    <summary className="cursor-pointer select-none rounded border border-gray-300 bg-white px-3 py-1.5 text-sm font-medium text-gray-700 shadow-sm hover:bg-gray-50">
                      Models ({selectedModels.length}/{allModels.length}) ▾
                    </summary>
                    <div className="absolute left-0 z-20 mt-1 max-h-64 min-w-[260px] overflow-auto rounded-md border border-gray-200 bg-white p-2 shadow-lg">
                      <div className="mb-2 flex items-center justify-between border-b pb-1.5 text-xs text-blue-600">
                        <button
                          type="button"
                          onClick={() => setSelectedModels([...allModels])}
                          className="hover:underline"
                        >
                          Select all
                        </button>
                        <button
                          type="button"
                          onClick={() => setSelectedModels([])}
                          className="hover:underline"
                        >
                          Deselect all
                        </button>
                      </div>
                      <div className="flex flex-col gap-1 text-sm text-gray-800">
                        {allModels.map((m) => {
                          const isChecked = selectedModels.includes(m);
                          return (
                            <label
                              key={m}
                              className="flex cursor-pointer items-center gap-2 rounded px-1 py-0.5 hover:bg-gray-100"
                            >
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
                                className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                              />
                              <span className="font-mono text-xs">{m}</span>
                            </label>
                          );
                        })}
                      </div>
                    </div>
                  </details>
                </div>
                <span className="text-xs text-gray-500">
                  {selectedModels.length} of {allModels.length} models selected
                </span>
              </div>
            )}

            {displayRows.length > 0 && (
              <>
                <SummaryCards
                  totals={displayTotals}
                  scannedAt={data.scannedAt}
                />
                <CostChart rows={displayRows} />
                <PeriodTable rows={displayRows} totals={displayTotals} />
              </>
            )}

            <details className="text-xs text-gray-500">
              <summary>Raw JSON</summary>
              <pre className="overflow-auto rounded bg-gray-50 p-3 text-gray-700">
                {JSON.stringify(data, null, 2).slice(0, 8000)}
              </pre>
            </details>
          </div>
        </div>
      )}
    </main>
  );
}
