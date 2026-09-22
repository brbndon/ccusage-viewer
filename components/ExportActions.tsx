"use client";

import { useState } from "react";
import type { CcusageRow, CcusageTotals, ViewKey } from "@/lib/ccusage";
import { buildUsageCsv, buildUsageMarkdown } from "@/lib/usage-exports";

interface Props {
  rows: CcusageRow[];
  totals: CcusageTotals;
  view: ViewKey;
  scannedAt: string;
  rangeLabel: string;
  providersLabel: string;
}

export default function ExportActions({
  rows,
  totals,
  view,
  scannedAt,
  rangeLabel,
  providersLabel,
}: Props) {
  const [status, setStatus] = useState("");

  async function copySummary() {
    try {
      await navigator.clipboard.writeText(
        buildUsageMarkdown({ rows, totals, view, scannedAt, rangeLabel, providersLabel })
      );
      setStatus("Summary copied as Markdown.");
    } catch {
      setStatus("Clipboard access failed. Try exporting the CSV instead.");
    }
  }

  function exportCsv() {
    const contents = buildUsageCsv(rows);
    const blob = new Blob([contents], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    const rangeSlug = rangeLabel
      .replaceAll(" → ", "-")
      .replaceAll(" ", "-")
      .replaceAll("/", "-");
    link.href = url;
    link.download = `ccusage-${view}-${rangeSlug}.csv`;
    document.body.append(link);
    link.click();
    link.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    setStatus(`${rows.length} periods exported as CSV.`);
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <button
        type="button"
        onClick={copySummary}
        className="btn-press rounded-md border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-700 shadow-2xs hover:bg-slate-50"
      >
        Copy Summary as Markdown
      </button>
      <button
        type="button"
        onClick={exportCsv}
        className="btn-press rounded-md border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-700 shadow-2xs hover:bg-slate-50"
      >
        Export CSV
      </button>
      <span role="status" aria-live="polite" className="text-xs text-slate-500">
        {status}
      </span>
    </div>
  );
}
