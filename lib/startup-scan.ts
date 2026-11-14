import { PROVIDERS, type ProviderSlug } from "@/lib/ccusage";
import { detectProviders } from "@/lib/ccusage-server";
import { DATE_PRESET_IDS, rangeForPreset } from "@/lib/date-presets";
import {
  isCacheRefreshing,
  readScanCache,
  setCacheRefreshing,
  type CachedScan,
} from "@/lib/scan-cache";
import { executeScan, type ScanParams } from "@/lib/scan-runner";

const DEFAULT_PROVIDERS: ProviderSlug[] = PROVIDERS.filter((p) => p !== "antigravity");

/**
 * A saved range that was a preset on the day it was scanned ("last 30 days")
 * moves forward with the calendar; any other range is repeated as saved.
 */
function rolledRange(cached: CachedScan, now: Date): [string, string] {
  const { since, until } = cached.query;
  const scannedOn = new Date(cached.scan.scannedAt);
  for (const id of DATE_PRESET_IDS) {
    const [presetSince, presetUntil] = rangeForPreset(id, scannedOn);
    if (presetSince === since && presetUntil === until) return rangeForPreset(id, now);
  }
  return [since, until];
}

async function paramsForRefresh(): Promise<ScanParams | null> {
  const cached = await readScanCache();
  if (cached) {
    const [since, until] = rolledRange(cached, new Date());
    const { view, providers } = cached.query;
    return {
      view,
      since,
      until,
      isAll: providers === "all",
      requestedProviders: providers === "all" ? [] : providers,
    };
  }

  // First run: the same starting point the page picks, the agents found on this machine.
  const detected = await detectProviders();
  const requestedProviders = DEFAULT_PROVIDERS.filter((slug) => detected.includes(slug));
  if (requestedProviders.length === 0) return null;
  const [since, until] = rangeForPreset("last30");
  return { view: "daily", since, until, isAll: false, requestedProviders };
}

/**
 * Repeats the last saved scan (or a first-run default) when the server starts,
 * so the page opens on current numbers. A successful scan saves itself.
 */
export async function refreshCacheOnStartup(): Promise<void> {
  if (isCacheRefreshing()) return;
  setCacheRefreshing(true);
  try {
    const params = await paramsForRefresh();
    if (!params) return;
    const res = await executeScan(params, new AbortController().signal);
    if (res.ok) {
      console.log(`[ccusage-viewer] refreshed saved ${params.view} scan`);
    } else {
      console.warn(`[ccusage-viewer] startup scan failed (${res.status}); keeping the previous scan`);
    }
  } catch (err) {
    console.warn("[ccusage-viewer] startup scan failed:", err);
  } finally {
    setCacheRefreshing(false);
  }
}
