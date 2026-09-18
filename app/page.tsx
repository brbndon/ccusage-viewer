"use client";
import { useEffect, useRef, useState } from "react";
import ScanControls from "@/components/ScanControls";
import ScanProgress, { formatElapsed } from "@/components/ScanProgress";
import SummaryCards from "@/components/SummaryCards";
import CostChart from "@/components/CostChart";
import PeriodTable from "@/components/PeriodTable";
import type { ScanResponse, ScanEngine, ViewKey } from "@/lib/ccusage";

/** Progress timer tick: 2 renders/sec keeps the elapsed readout alive without churning. */
const PROGRESS_TICK_MS = 500;

function ScanSkeleton() {
  return (
    <div aria-hidden="true" className="flex flex-col gap-4">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-6">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="scan-skeleton rounded-lg border border-gray-200 bg-gray-100 p-3">
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
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [data, setData] = useState<ScanResponse | null>(null);
  const [elapsedSec, setElapsedSec] = useState(0);
  const [lastDurationSec, setLastDurationSec] = useState<number | null>(null);
  const [lastEngine, setLastEngine] = useState<ScanEngine | null>(null);
  // Snapshot of the in-flight request. Control state stays editable during a
  // scan (for queueing the next one), so the progress panel must show what is
  // actually running — not whatever the pills say right now.
  const [scanQuery, setScanQuery] = useState<{ view: ViewKey; since: string; until: string }>({
    view: "daily",
    since: "",
    until: "",
  });
  // One-shot screen-reader announcement on scan completion (failures use the
  // role="alert" error panel instead). Timestamped so repeats re-announce.
  const [announcement, setAnnouncement] = useState("");
  const abortRef = useRef<AbortController | null>(null);
  const reqIdRef = useRef(0);

  useEffect(() => () => abortRef.current?.abort(), []);

  // Elapsed timer keeps the progress view alive and informative during the
  // 60-120s `npx ccusage` runs. Interval only ticks while loading.
  useEffect(() => {
    if (!loading) return;
    const started = Date.now();
    const t = setInterval(() => setElapsedSec(Math.floor((Date.now() - started) / 1000)), PROGRESS_TICK_MS);
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
    setScanQuery({ view, since, until });
    try {
      const q = new URLSearchParams({ view });
      if (since) q.set("since", since);
      if (until) q.set("until", until);
      const res = await fetch(`/api/scan?${q.toString()}`, { signal: ctrl.signal });
      const body = await res.json();
      if (!res.ok) throw new Error(body?.detail ? `${body.error}: ${body.detail}` : (body?.error ?? "Scan failed"));
      if (reqIdRef.current === reqId) {
        const done = body as ScanResponse;
        const durSec = Math.round((Date.now() - started) / 1000);
        setData(done);
        setLastDurationSec(durSec);
        setLastEngine(done.engine ?? null);
        setAnnouncement(
          `${done.view} scan complete: ${done.rows.length} rows in ${formatElapsed(durSec)}, at ${new Date(done.scannedAt).toLocaleTimeString()}.`
        );
      }
    } catch (e) {
      if (e instanceof DOMException && e.name === "AbortError") return;
      if (reqIdRef.current === reqId) setError(e instanceof Error ? e.message : "Scan failed");
    } finally {
      if (reqIdRef.current === reqId) setLoading(false);
    }
  }

  const showEmptyHint = !data && !error && !loading;
  const showFirstScanSkeleton = loading && !data && !error;

  return (
    <main className="mx-auto max-w-6xl p-6 flex flex-col gap-6">
      <header>
        <h1 className="text-2xl font-bold text-gray-900">ccusage Viewer</h1>
        <p className="text-sm text-gray-600">
          Runs <code>npx --yes ccusage@latest {"<view>"} --json</code> on this Mac. Local dev only.
          {lastDurationSec !== null && !loading && (
            <span className="ml-2 text-gray-500">
              Last scan took {formatElapsed(lastDurationSec)}
              {lastEngine ? ` · ${lastEngine.spec}${lastEngine.pinned ? " (registry latest)" : " (cached — registry unreachable)"}` : ""}.
            </span>
          )}
        </p>
      </header>
      <ScanControls view={view} since={since} until={until} loading={loading}
        onViewChange={setView} onSinceChange={setSince} onUntilChange={setUntil} onScan={scan} />
      {announcement && (
        <p role="status" className="sr-only">
          {announcement}
        </p>
      )}

      {loading && (
        <ScanProgress
          view={scanQuery.view}
          since={scanQuery.since}
          until={scanQuery.until}
          elapsedSec={elapsedSec}
          hasPreviousData={data !== null && data.rows.length > 0}
          onCancel={cancel}
        />
      )}

      {error && (
        <div role="alert" className="rounded border border-red-300 bg-red-50 p-3 text-sm text-red-800">
          <p className="font-semibold">Scan failed</p>
          <p className="mt-1 break-words">{error}</p>
          <p className="mt-1 text-red-700">
            Long scans are normal (ccusage@latest can take 1–2 min). Try again — or narrow the range with Since/Until.
          </p>
          <button type="button" disabled={loading} onClick={scan} className="mt-2 font-semibold underline disabled:opacity-50">
            Retry
          </button>
        </div>
      )}
      {showEmptyHint && <p className="text-gray-500 text-sm">Press Scan to load {view} usage.</p>}
      {showFirstScanSkeleton && <ScanSkeleton />}
      {data && !error && data.rows.length === 0 && !loading && (
        <p className="rounded border border-gray-200 bg-gray-50 p-3 text-sm text-gray-600">No {view} data returned by ccusage (e.g. no active billing block). Try another view.</p>
      )}
      {data && data.rows.length > 0 && (
        // Keep previous results mounted and interactive during rescans so the
        // page never blanks out to a bare "scanning…" state.
        <div aria-busy={loading} className={loading ? "pointer-events-none select-none opacity-60 saturate-50" : undefined}>
          <div className="flex flex-col gap-6">
            <SummaryCards totals={data.totals} scannedAt={data.scannedAt} />
            <CostChart rows={data.rows} />
            <PeriodTable rows={data.rows} totals={data.totals} />
            <details className="text-xs text-gray-500"><summary>Raw JSON</summary><pre className="overflow-auto rounded bg-gray-50 p-3 text-gray-700">{JSON.stringify(data, null, 2).slice(0, 8000)}</pre></details>
          </div>
        </div>
      )}
    </main>
  );
}
