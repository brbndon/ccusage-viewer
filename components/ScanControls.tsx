"use client";

import type { ProviderSlug, ViewKey } from "@/lib/ccusage";
import { PROVIDERS, VIEW_SUPPORT, VIEWS } from "@/lib/ccusage";

const MAIN_PROVIDERS: ProviderSlug[] = ["codex", "claude", "opencode"];
const OVERFLOW_PROVIDERS: ProviderSlug[] = PROVIDERS.filter(
  (p) => !MAIN_PROVIDERS.includes(p)
);
const DEFAULT_PROVIDERS: ProviderSlug[] = PROVIDERS.filter(
  (p) => p !== "antigravity"
);

interface Props {
  view: ViewKey;
  since: string;
  until: string;
  loading: boolean;
  providers: "all" | ProviderSlug[];
  onViewChange: (v: ViewKey) => void;
  onSinceChange: (v: string) => void;
  onUntilChange: (v: string) => void;
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
      p.onProvidersChange([slug]);
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

  const currentViewConflict = getViewConflict(p.view);
  const isScanDisabled = p.loading || !!currentViewConflict;

  const selectedOverflow: ProviderSlug[] =
    p.providers === "all"
      ? []
      : p.providers.filter((prov: ProviderSlug) =>
          OVERFLOW_PROVIDERS.includes(prov)
        );

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
                className={`btn-press rounded-full border px-3 py-1 text-xs font-semibold transition-colors ${
                  active
                    ? "border-blue-600 bg-blue-50 text-blue-800 shadow-2xs"
                    : "border-slate-200 bg-white text-slate-600 hover:border-slate-300"
                }`}
              >
                {active ? "✓ " : ""}
                {slug.charAt(0).toUpperCase() + slug.slice(1)}
              </button>
            );
          })}

          {selectedOverflow.map((slug: ProviderSlug) => (
            <button
              key={slug}
              type="button"
              onClick={() => toggleProvider(slug)}
              className="btn-press flex items-center gap-1 rounded-full border border-blue-600 bg-blue-50 px-3 py-1 text-xs font-semibold text-blue-800 shadow-2xs"
              title="Click to remove"
            >
              <span>✓ {slug}</span>
              <span className="text-blue-500 hover:text-blue-700">×</span>
            </button>
          ))}

          <select
            value=""
            onChange={(e) => {
              if (e.target.value) {
                toggleProvider(e.target.value as ProviderSlug);
              }
            }}
            className="rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-medium text-slate-600 hover:border-slate-300 focus:outline-hidden"
          >
            <option value="">
              + More providers ({selectedOverflow.length} selected)
            </option>
            {OVERFLOW_PROVIDERS.map((slug) => {
              const isSel = isProviderSelected(slug);
              return (
                <option key={slug} value={slug}>
                  {isSel ? "✓ " : "  "}
                  {slug}
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
          <label className="flex flex-col text-xs font-medium text-slate-500">
            <span>Since</span>
            <input
              type="date"
              value={p.since}
              onChange={(e) => p.onSinceChange(e.target.value)}
              className="mt-1 rounded-md border border-slate-200 bg-white px-2 py-1 text-xs text-slate-800 focus:border-blue-500 focus:outline-hidden"
            />
          </label>
          <label className="flex flex-col text-xs font-medium text-slate-500">
            <span>Until</span>
            <input
              type="date"
              value={p.until}
              onChange={(e) => p.onUntilChange(e.target.value)}
              className="mt-1 rounded-md border border-slate-200 bg-white px-2 py-1 text-xs text-slate-800 focus:border-blue-500 focus:outline-hidden"
            />
          </label>

          <div className="flex flex-col">
            <button
              type="button"
              onClick={p.onScan}
              disabled={isScanDisabled}
              aria-busy={p.loading}
              title={currentViewConflict ?? undefined}
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
          </div>
        </div>
      </div>
    </div>
  );
}
