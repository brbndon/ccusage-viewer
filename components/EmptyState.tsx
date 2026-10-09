import type { ProviderSlug, ViewKey } from "@/lib/ccusage";

interface Props {
  view: ViewKey;
  /** Providers with a local data folder; null until detection finishes. */
  detected: ProviderSlug[] | null;
  rangeLabel: string;
  isSlowScan: boolean;
}

export default function EmptyState({ view, detected, rangeLabel, isSlowScan }: Props) {
  return (
    <div className="rounded-xl border border-dashed border-slate-200 bg-white/60 p-6 text-sm text-slate-600">
      <p className="font-semibold text-slate-800">Ready to scan</p>
      <ol className="mt-2 flex list-inside list-decimal flex-col gap-1 text-xs">
        <li>
          Pick the agents to include. Detected on this Mac:{" "}
          {detected === null ? (
            <span className="text-slate-400">checking…</span>
          ) : detected.length > 0 ? (
            <span className="font-medium text-slate-800">{detected.join(", ")}</span>
          ) : (
            <span className="font-medium text-amber-700">
              none found. Use an agent such as Claude Code or Codex first, then
              reload.
            </span>
          )}
        </li>
        <li>
          Choose a range (currently{" "}
          <span className="font-medium text-slate-800">{rangeLabel}</span>) and a
          granularity ({view}).
        </li>
        <li>
          Press <span className="font-semibold text-slate-800">Scan Usage</span>{" "}
          or ⌘ Enter.
        </li>
      </ol>
      <p className="mt-3 text-xs text-slate-500">
        {isSlowScan
          ? "This selection includes slow providers, so expect 60–120s."
          : "Scans of a few providers usually take a few seconds; wide ranges and Codex take longer."}{" "}
        Everything runs locally; no usage data leaves this machine.
      </p>
    </div>
  );
}
