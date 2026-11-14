"use client";

import type { ProviderSlug, ViewKey } from "@/lib/ccusage";
import { PROVIDERS, VIEW_SUPPORT, VIEWS } from "@/lib/ccusage";
import { rangeForPreset, type DatePreset } from "@/lib/date-presets";

const MAIN_PROVIDERS: ProviderSlug[] = ["codex", "claude", "opencode"];
const OVERFLOW_PROVIDERS: ProviderSlug[] = PROVIDERS.filter(
  (p) => !MAIN_PROVIDERS.includes(p)
);
const DEFAULT_PROVIDERS: ProviderSlug[] = PROVIDERS.filter(
  (p) => p !== "antigravity"
);

const DATE_PRESETS: { id: DatePreset; label: string }[] = [
  { id: "all", label: "All history" },
  { id: "today", label: "Today" },
  { id: "last7", label: "7 days" },
  { id: "last30", label: "30 days" },
  { id: "month", label: "This month" },
];

interface Props {
  view: ViewKey;
  since: string;
  until: string;
  loading: boolean;
  providers: "all" | ProviderSlug[];
  /** ccusage was not found; scanning cannot work until it is installed. */
  scanBlocked?: boolean;
  /** Providers whose local data folder exists; null until detection finishes. */
  detected: ProviderSlug[] | null;
  onViewChange: (v: ViewKey) => void;
  onSinceChange: (v: string) => void;
  onUntilChange: (v: string) => void;
  onDateRangeChange: (since: string, until: string) => void;
  onProvidersChange: (providers: "all" | ProviderSlug[]) => void;
  onScan: () => void;
}

export default function ScanControls(p: Props) {
  const isAll = p.providers === "all";

  function isProviderSelected(slug: ProviderSlug): boolean {
    if (p.providers === "all") return true;
    return p.providers.includes(slug);
  }

  function toggleProvider(slug: ProviderSlug) {
    if (p.providers === "all") {
      p.onProvidersChange(PROVIDERS.filter((provider) => provider !== slug));
      return;
    }
    const currentList: ProviderSlug[] = p.providers;
    if (currentList.includes(slug)) {
      p.onProvidersChange(currentList.filter((x: ProviderSlug) => x !== slug));
    } else {
      p.onProvidersChange([...currentList, slug]);
    }
  }

  function getViewConflict(v: ViewKey): string | null {
    if (p.providers === "all") return null;
    if (p.providers.length === 0) return "Select at least one provider";
    for (const prov of p.providers) {
      if (!VIEW_SUPPORT[prov]?.includes(v)) {
        return `view ${v} is not supported by provider ${prov}`;
      }
    }
    return null;
  }

  function hasNoData(slug: ProviderSlug): boolean {
    return p.detected !== null && !p.detected.includes(slug);
  }

  const currentViewConflict = getViewConflict(p.view);
  const isScanDisabled = p.loading || !!currentViewConflict || !!p.scanBlocked;

  const selectedOverflow: ProviderSlug[] =
    p.providers === "all"
      ? []
      : p.providers.filter((prov: ProviderSlug) =>
          OVERFLOW_PROVIDERS.includes(prov)
        );
  const currentDate = new Date();
  const selectedDatePreset = DATE_PRESETS.find(({ id }) => {
    const [presetSince, presetUntil] = rangeForPreset(id, currentDate);
    return p.since === presetSince && p.until === presetUntil;
  })?.id;
  const rangeDescription = p.since || p.until
    ? `${p.since || "Any start"} → ${p.until || "Latest"}`
    : "All history";

  return (
    <div className="flex flex-col gap-4 rounded-xl border border-slate-200/80 bg-white p-5 shadow-xs">
      {/* Provider Selector */}
      <div className="flex flex-col gap-2">
        <div className="flex items-center justify-between">
          <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">
            Target Providers
          </span>
          <div className="flex items-center gap-1 text-xs">
            <button
              type="button"
              onClick={() => p.onProvidersChange("all")}
              aria-pressed={isAll}
              className={`btn-press rounded border px-2 py-0.5 font-medium transition-colors ${
                isAll
                  ? "border-amber-500 bg-amber-50 text-amber-900"
                  : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
              }`}
            >
              All incl. slow
            </button>
            <button
              type="button"
              onClick={() => p.onProvidersChange(DEFAULT_PROVIDERS)}
              className="btn-press rounded border border-slate-200 bg-white px-2 py-0.5 text-slate-600 hover:bg-slate-50"
            >
              Reset default
            </button>
            <button
              type="button"
              onClick={() => p.onProvidersChange([])}
              className="btn-press rounded border border-slate-200 bg-white px-2 py-0.5 text-slate-600 hover:bg-slate-50"
            >
              Clear
            </button>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {MAIN_PROVIDERS.map((slug) => {
            const active = isProviderSelected(slug);
            return (
              <button
                key={slug}
                type="button"
                onClick={() => toggleProvider(slug)}
                aria-pressed={active}
                title={hasNoData(slug) ? "No local data folder found for this agent" : undefined}
                className={`btn-press rounded-full border px-3 py-1 text-xs font-semibold transition-colors ${
                  active
                    ? "border-blue-600 bg-blue-50 text-blue-800 shadow-2xs"
                    : "border-slate-200 bg-white text-slate-600 hover:border-slate-300"
                } ${hasNoData(slug) ? "opacity-60" : ""}`}
              >
                {active ? "✓ " : ""}
                {slug.charAt(0).toUpperCase() + slug.slice(1)}
                {hasNoData(slug) ? " · no data" : ""}
              </button>
            );
          })}

          <select
            value=""
            aria-label="More providers"
            onChange={(e) => {
              if (e.target.value) {
                toggleProvider(e.target.value as ProviderSlug);
              }
            }}
            className="rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-medium text-slate-600 hover:border-slate-300"
          >
            <option value="">
              + More providers ({isAll ? "all selected" : `${selectedOverflow.length} selected`})
            </option>
            {OVERFLOW_PROVIDERS.map((slug) => {
              const isSel = isProviderSelected(slug);
              return (
                <option key={slug} value={slug}>
                  {isSel ? "✓ " : "  "}
                  {slug}
                  {hasNoData(slug) ? " (no data found)" : ""}
                </option>
              );
            })}
          </select>
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-4 border-t border-slate-100 pt-3">
        {/* View mode toggle */}
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="mr-1 text-xs font-semibold uppercase tracking-wider text-slate-400">
            Granularity:
          </span>
          <div className="inline-flex rounded-lg border border-slate-200 bg-slate-50 p-0.5">
            {VIEWS.map((v) => {
              const conflict = getViewConflict(v);
              const disabled = !!conflict;
              const active = p.view === v;
              return (
                <button
                  key={v}
                  type="button"
                  onClick={() => p.onViewChange(v)}
                  disabled={disabled}
                  title={conflict ?? undefined}
                  className={`btn-press rounded-md px-3 py-1 text-xs font-semibold transition-colors ${
                    active
                      ? "bg-white text-slate-900 shadow-xs"
                      : disabled
                      ? "cursor-not-allowed text-slate-300 opacity-50"
                      : "text-slate-600 hover:text-slate-900"
                  }`}
                >
                  {v.charAt(0).toUpperCase() + v.slice(1)}
                </button>
              );
            })}
          </div>
        </div>

        {/* Date range & Scan CTA */}
        <div className="flex flex-wrap items-end gap-3">
          <div className="flex flex-col gap-1">
            <span className="text-xs font-medium text-slate-500">Quick range</span>
            <div className="flex flex-wrap items-center gap-1">
              {DATE_PRESETS.map(({ id, label }) => (
                <button
                  key={id}
                  type="button"
                  aria-pressed={selectedDatePreset === id}
                  onClick={() => p.onDateRangeChange(...rangeForPreset(id))}
                  className={`btn-press rounded-md border px-2 py-1 text-[11px] font-medium transition-colors ${
                    selectedDatePreset === id
                      ? "border-blue-300 bg-blue-50 text-blue-800"
                      : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
          <label className="flex flex-col text-xs font-medium text-slate-500">
            <span>Since</span>
            <input
              type="date"
              name="since"
              autoComplete="off"
              value={p.since}
              max={p.until || undefined}
              onChange={(e) => p.onSinceChange(e.target.value)}
              className="mt-1 rounded-md border border-slate-200 bg-white px-2 py-1 text-xs text-slate-800 focus:border-blue-500"
            />
          </label>
          <label className="flex flex-col text-xs font-medium text-slate-500">
            <span>Until</span>
            <input
              type="date"
              name="until"
              autoComplete="off"
              value={p.until}
              min={p.since || undefined}
              onChange={(e) => p.onUntilChange(e.target.value)}
              className="mt-1 rounded-md border border-slate-200 bg-white px-2 py-1 text-xs text-slate-800 focus:border-blue-500"
            />
          </label>

          <div className="flex flex-col">
            <button
              type="button"
              onClick={p.onScan}
              disabled={isScanDisabled}
              aria-busy={p.loading}
              aria-keyshortcuts="Meta+Enter Control+Enter"
              title={
                p.scanBlocked ? "Install ccusage first" : (currentViewConflict ?? undefined)
              }
              className="btn-press flex items-center gap-2 rounded-lg bg-blue-600 px-5 py-1.5 text-xs font-bold text-white shadow-xs hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {p.loading && (
                <svg
                  className="h-3.5 w-3.5 animate-spin"
                  viewBox="0 0 24 24"
                  fill="none"
                  aria-hidden="true"
                >
                  <circle
                    className="opacity-25"
                    cx="12"
                    cy="12"
                    r="10"
                    stroke="currentColor"
                    strokeWidth="4"
                  />
                  <path
                    className="opacity-90"
                    fill="currentColor"
                    d="M4 12a8 8 0 0 1 8-8v4a4 4 0 0 0-4 4H4z"
                  />
                </svg>
              )}
              <span>{p.loading ? "Scanning…" : "Scan Usage"}</span>
            </button>
            {currentViewConflict && (
              <span className="mt-1 text-[11px] text-red-600">
                {currentViewConflict}
              </span>
            )}
            <span className="mt-1 text-[11px] text-slate-500" title="Start a scan from anywhere on the page">
              ⌘ Enter / Ctrl Enter
            </span>
          </div>
        </div>
        <p className="text-[11px] text-slate-500" aria-live="polite">
          Date range: <span className="font-medium text-slate-700">{rangeDescription}</span>
        </p>
      </div>
    </div>
  );
}
