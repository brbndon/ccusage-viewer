"use client";
import type { ViewKey } from "@/lib/ccusage";
import { VIEWS } from "@/lib/ccusage";

interface Props {
  view: ViewKey;
  since: string;
  until: string;
  loading: boolean;
  onViewChange: (v: ViewKey) => void;
  onSinceChange: (v: string) => void;
  onUntilChange: (v: string) => void;
  onScan: () => void;
}

export default function ScanControls(p: Props) {
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap gap-2">
        {VIEWS.map((v) => (
          <button
            key={v}
            type="button"
            onClick={() => p.onViewChange(v)}
            className={`rounded-full px-4 py-1.5 text-sm font-medium border ${p.view === v ? "bg-black text-white border-black" : "bg-white text-gray-700 border-gray-300 hover:border-gray-500"}`}
          >
            {v}
          </button>
        ))}
      </div>
      <div className="flex flex-wrap items-end gap-3">
        <label className="flex flex-col text-sm text-gray-600">
          Since
          <input type="date" value={p.since} onChange={(e) => p.onSinceChange(e.target.value)} className="rounded border border-gray-300 px-2 py-1.5 text-gray-900" />
        </label>
        <label className="flex flex-col text-sm text-gray-600">
          Until
          <input type="date" value={p.until} onChange={(e) => p.onUntilChange(e.target.value)} className="rounded border border-gray-300 px-2 py-1.5 text-gray-900" />
        </label>
        <button
          type="button"
          onClick={p.onScan}
          disabled={p.loading}
          aria-busy={p.loading}
          className="flex items-center gap-2 rounded-lg bg-blue-600 px-6 py-2 font-semibold text-white hover:bg-blue-700 disabled:cursor-wait disabled:opacity-70"
        >
          {p.loading && (
            <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-90" fill="currentColor" d="M4 12a8 8 0 0 1 8-8v4a4 4 0 0 0-4 4H4z" />
            </svg>
          )}
          {p.loading ? "Scanning…" : "Scan"}
        </button>
      </div>
    </div>
  );
}
