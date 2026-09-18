"use client";

interface Props {
  view: string;
  since: string;
  until: string;
  elapsedSec: number;
  hasPreviousData: boolean;
  onCancel: () => void;
}

function stepFor(elapsedSec: number): number {
  // Heuristic UX thresholds, not measured pipeline phases — ccusage streams
  // no progress, so the checklist advances on elapsed time only.
  if (elapsedSec < STEP_CUTOFFS_SEC[0]) return 0;
  if (elapsedSec < STEP_CUTOFFS_SEC[1]) return 1;
  if (elapsedSec < STEP_CUTOFFS_SEC[2]) return 2;
  return 3;
}

/** Elapsed-second cutoffs at which the step checklist advances. */
const STEP_CUTOFFS_SEC = [8, 30, 90] as const;

const STEPS = [
  "Resolving ccusage@latest",
  "Reading local usage history",
  "Aggregating usage totals",
  "Finalizing results",
] as const;

export function formatElapsed(totalSec: number): string {
  const total = Math.max(0, Math.floor(totalSec));
  const m = Math.floor(total / 60);
  const s = total % 60;
  return m > 0 ? `${m}m ${String(s).padStart(2, "0")}s` : `${s}s`;
}

export default function ScanProgress({ view, since, until, elapsedSec, hasPreviousData, onCancel }: Props) {
  const active = stepFor(elapsedSec);
  const range = since || until ? `${since || "…"} → ${until || "now"}` : "all history";

  return (
    <section
      aria-label={`Scan progress: ${view}`}
      className="rounded-lg border border-blue-200 bg-blue-50/60 p-4"
    >
      <div className="flex items-start gap-3">
        <svg
          className="mt-0.5 h-5 w-5 shrink-0 animate-spin text-blue-700"
          viewBox="0 0 24 24"
          fill="none"
          aria-hidden="true"
        >
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
          <path
            className="opacity-90"
            fill="currentColor"
            d="M4 12a8 8 0 0 1 8-8v4a4 4 0 0 0-4 4H4z"
          />
        </svg>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            {/* aria-hidden: this ticks ~2x/sec; announcing it would spam SRs.
                Screen-reader users get one announcement from the status region
                below plus a completion announcement when results land. */}
            <p aria-hidden="true" className="font-semibold text-gray-900">
              Scanning {view} usage… {formatElapsed(elapsedSec)}
            </p>
            <button
              type="button"
              onClick={onCancel}
              aria-label={`Cancel ${view} scan`}
              className="rounded-md border border-gray-300 bg-white px-3 py-1 text-sm font-medium text-gray-700 hover:border-gray-500 hover:text-gray-900"
            >
              Cancel
            </button>
          </div>
          {/* Sole live region. role="status" implies aria-live="polite"; its
              content is static for the life of a scan (snapshot props), so it
              announces exactly once on mount instead of on every timer tick. */}
          <p role="status" className="mt-0.5 text-sm text-gray-600">
            <code className="rounded bg-white/80 px-1 font-mono text-xs text-gray-800">
              npx --yes ccusage@latest {view} --json
            </code>{" "}
            · {range}
            {hasPreviousData ? " · keeping previous results visible" : ""}
          </p>

          {/* Indeterminate progress bar: the scan streams no percentage, so
              animate motion rather than faking a percent. */}
          <div
            className="mt-3 h-2 overflow-hidden rounded-full bg-blue-100"
            aria-hidden="true"
          >
            <div className="scan-progress-bar h-full w-1/3 rounded-full bg-blue-600" />
          </div>

          <ol className="mt-3 grid gap-1 text-sm sm:grid-cols-2">
            {STEPS.map((label, i) => {
              const done = i < active;
              const current = i === active;
              return (
                <li key={label} className="flex items-center gap-2" aria-current={current ? "step" : undefined}>
                  <span
                    aria-hidden="true"
                    className={`flex h-4 w-4 items-center justify-center rounded-full text-[10px] font-bold ${
                      done
                        ? "bg-green-600 text-white"
                        : current
                          ? "bg-blue-600 text-white"
                          : "bg-gray-200 text-gray-500"
                    }`}
                  >
                    {done ? "✓" : i + 1}
                  </span>
                  <span className={current ? "font-medium text-gray-900" : done ? "text-gray-700" : "text-gray-500"}>
                    {label}
                    {current ? "…" : ""}
                  </span>
                </li>
              );
            })}
          </ol>

          <p className="mt-2 text-xs text-gray-500">
            Full-history scans routinely take 60–120s while ccusage reads your
            local usage history — the wait is the history scan, not the
            download. You can keep browsing — results appear automatically.
          </p>
        </div>
      </div>
    </section>
  );
}
