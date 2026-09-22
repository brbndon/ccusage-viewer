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
    <div className="flex flex-col gap-3">
      {/* Provider Selector */}
      <div className="flex flex-col gap-1.5">
        <span className="text-xs font-semibold uppercase tracking-wider text-gray-500">
          Providers
        </span>
        <div className="flex flex-wrap items-center gap-2">
          {MAIN_PROVIDERS.map((slug) => {
            const active = isProviderSelected(slug);
            return (
              <button
                key={slug}
                type="button"
                onClick={() => toggleProvider(slug)}
                className={`rounded-full border px-3 py-1 text-sm font-medium transition-colors ${
                  active
                    ? "border-blue-600 bg-blue-50 text-blue-800"
                    : "border-gray-300 bg-white text-gray-700 hover:border-gray-400"
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
              className="flex items-center gap-1 rounded-full border border-blue-600 bg-blue-50 px-3 py-1 text-sm font-medium text-blue-800"
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
            className="rounded-full border border-gray-300 bg-white px-3 py-1 text-sm text-gray-700 hover:border-gray-400"
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

          <div className="flex items-center gap-1.5 pl-2 text-xs">
            <button
              type="button"
              onClick={() => p.onProvidersChange("all")}
              className={`rounded px-2 py-1 font-medium border ${
                isAll
                  ? "border-amber-500 bg-amber-50 text-amber-900"
                  : "border-gray-300 bg-white text-gray-600 hover:bg-gray-50"
              }`}
            >
              All incl. slow
            </button>
            <button
              type="button"
              onClick={() => p.onProvidersChange(DEFAULT_PROVIDERS)}
              className="rounded border border-gray-300 bg-white px-2 py-1 text-gray-600 hover:bg-gray-50"
            >
              Reset to default
            </button>
            <button
              type="button"
              onClick={() => p.onProvidersChange([])}
              className="rounded border border-gray-300 bg-white px-2 py-1 text-gray-600 hover:bg-gray-50"
            >
              Clear
            </button>
          </div>
        </div>
      </div>

      {/* View buttons with matrix gating */}
      <div className="flex flex-wrap gap-2">
        {VIEWS.map((v) => {
          const conflict = getViewConflict(v);
          const disabled = !!conflict;
          return (
            <button
              key={v}
              type="button"
              onClick={() => p.onViewChange(v)}
              disabled={disabled}
              title={conflict ?? undefined}
              className={`rounded-full border px-4 py-1.5 text-sm font-medium transition-opacity ${
                p.view === v
                  ? "border-black bg-black text-white"
                  : disabled
                    ? "cursor-not-allowed border-gray-200 bg-gray-100 text-gray-400 opacity-60"
                    : "border-gray-300 bg-white text-gray-700 hover:border-gray-500"
              }`}
            >
              {v}
            </button>
          );
        })}
      </div>

      {/* Date controls and Scan button */}
      <div className="flex flex-wrap items-end gap-3">
        <label className="flex flex-col text-sm text-gray-600">
          Since
          <input
            type="date"
            value={p.since}
            onChange={(e) => p.onSinceChange(e.target.value)}
            className="rounded border border-gray-300 px-2 py-1.5 text-gray-900"
          />
        </label>
        <label className="flex flex-col text-sm text-gray-600">
          Until
          <input
            type="date"
            value={p.until}
            onChange={(e) => p.onUntilChange(e.target.value)}
            className="rounded border border-gray-300 px-2 py-1.5 text-gray-900"
          />
        </label>
        <div className="flex flex-col">
          <button
            type="button"
            onClick={p.onScan}
            disabled={isScanDisabled}
            aria-busy={p.loading}
            title={currentViewConflict ?? undefined}
            className="flex items-center gap-2 rounded-lg bg-blue-600 px-6 py-2 font-semibold text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {p.loading && (
              <svg
                className="h-4 w-4 animate-spin"
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
            {p.loading ? "Scanning…" : "Scan"}
          </button>
          {currentViewConflict && (
            <span className="mt-1 text-xs text-red-600">
              {currentViewConflict}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
