"use client";
import { useState } from "react";
import ScanControls from "@/components/ScanControls";
import SummaryCards from "@/components/SummaryCards";
import CostChart from "@/components/CostChart";
import PeriodTable from "@/components/PeriodTable";
import type { ScanResponse, ViewKey } from "@/lib/ccusage";

export default function Home() {
  const [view, setView] = useState<ViewKey>("daily");
  const [since, setSince] = useState("");
  const [until, setUntil] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [data, setData] = useState<ScanResponse | null>(null);

  async function scan() {
    setLoading(true);
    setError("");
    try {
      const q = new URLSearchParams({ view });
      if (since) q.set("since", since);
      if (until) q.set("until", until);
      const res = await fetch(`/api/scan?${q.toString()}`);
      const body = await res.json();
      if (!res.ok) throw new Error(body?.detail ? `${body.error}: ${body.detail}` : (body?.error ?? "Scan failed"));
      setData(body as ScanResponse);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Scan failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="mx-auto max-w-6xl p-6 flex flex-col gap-6">
      <header>
        <h1 className="text-2xl font-bold">ccusage Viewer</h1>
        <p className="text-sm text-gray-600">Runs <code>npx ccusage {"<view>"} --json</code> on this Mac. Local dev only.</p>
      </header>
      <ScanControls view={view} since={since} until={until} loading={loading}
        onViewChange={setView} onSinceChange={setSince} onUntilChange={setUntil} onScan={scan} />
      {error && <div className="rounded border border-red-300 bg-red-50 p-3 text-sm text-red-800">{error} <button onClick={scan} className="underline font-semibold">Retry</button></div>}
      {!data && !error && <p className="text-gray-500 text-sm">Press Scan to load {view} usage.</p>}
      {data && data.rows.length === 0 && (
        <p className="rounded border border-gray-200 bg-gray-50 p-3 text-sm text-gray-600">No {view} data returned by ccusage (e.g. no active billing block). Try another view.</p>
      )}
      {data && data.rows.length > 0 && (
        <>
          <SummaryCards totals={data.totals} scannedAt={data.scannedAt} />
          <CostChart rows={data.rows} />
          <PeriodTable rows={data.rows} totals={data.totals} />
          <details className="text-xs text-gray-500"><summary>Raw JSON</summary><pre className="overflow-auto rounded bg-gray-50 p-3">{JSON.stringify(data, null, 2).slice(0, 8000)}</pre></details>
        </>
      )}
    </main>
  );
}
