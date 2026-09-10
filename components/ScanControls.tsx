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
          onClick={p.onScan}
          disabled={p.loading}
          className="rounded-lg bg-blue-600 px-6 py-2 font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
        >
          {p.loading ? "Scanning…" : "Scan"}
        </button>
      </div>
    </div>
  );
}
