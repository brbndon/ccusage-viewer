"use client";
import type { CcusageTotals } from "@/lib/ccusage";

function fmt(n: number) { return n.toLocaleString("en-US"); }
function money(n: number) { return `$${n.toFixed(2)}`; }

export default function SummaryCards({ totals, scannedAt }: { totals: CcusageTotals; scannedAt: string }) {
  const cards: [string, string][] = [
    ["Total cost", money(totals.totalCost)],
    ["Total tokens", fmt(totals.totalTokens)],
    ["Input", fmt(totals.inputTokens)],
    ["Output", fmt(totals.outputTokens)],
    ["Cache read", fmt(totals.cacheReadTokens)],
    ["Cache creation", fmt(totals.cacheCreationTokens)],
  ];
  return (
    <section>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-6">
        {cards.map(([k, v]) => (
          <div key={k} className="rounded-lg border border-gray-200 bg-white p-3">
            <div className="text-xs uppercase text-gray-500">{k}</div>
            <div className="text-lg font-semibold text-gray-900">{v}</div>
          </div>
        ))}
      </div>
      <p className="mt-2 text-xs text-gray-500">Scanned at {new Date(scannedAt).toLocaleString()}</p>
    </section>
  );
}
