import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import {
  isProviderSlug,
  isRow,
  isTotals,
  isViewKey,
  type ProviderSlug,
  type ScanResponse,
  type ViewKey,
} from "@/lib/ccusage";

/** What was asked of ccusage; enough to repeat the scan later. */
export interface ScanQuery {
  view: ViewKey;
  since: string;
  until: string;
  providers: "all" | ProviderSlug[];
}

/** The single saved scan: each new scan replaces the previous one. */
export interface CachedScan {
  version: 1;
  savedAt: string;
  query: ScanQuery;
  scan: ScanResponse;
}

const CACHE_DIR = path.join(process.cwd(), ".cache");
const CACHE_FILE = path.join(CACHE_DIR, "last-scan.json");

function isScanQuery(v: unknown): v is ScanQuery {
  if (typeof v !== "object" || v === null) return false;
  const q = v as Record<string, unknown>;
  return (
    typeof q.view === "string" &&
    isViewKey(q.view) &&
    typeof q.since === "string" &&
    typeof q.until === "string" &&
    (q.providers === "all" ||
      (Array.isArray(q.providers) &&
        q.providers.every((p) => typeof p === "string" && isProviderSlug(p))))
  );
}

function isScanResponse(v: unknown): v is ScanResponse {
  if (typeof v !== "object" || v === null) return false;
  const s = v as Record<string, unknown>;
  return (
    typeof s.view === "string" &&
    isViewKey(s.view) &&
    typeof s.scannedAt === "string" &&
    !Number.isNaN(Date.parse(s.scannedAt)) &&
    Array.isArray(s.rows) &&
    s.rows.every(isRow) &&
    isTotals(s.totals)
  );
}

function isCachedScan(v: unknown): v is CachedScan {
  if (typeof v !== "object" || v === null) return false;
  const c = v as Record<string, unknown>;
  return (
    c.version === 1 &&
    typeof c.savedAt === "string" &&
    isScanQuery(c.query) &&
    isScanResponse(c.scan)
  );
}

/** The saved scan, or null when none exists or the file is unreadable or outdated. */
export async function readScanCache(): Promise<CachedScan | null> {
  try {
    const parsed: unknown = JSON.parse(await readFile(CACHE_FILE, "utf8"));
    return isCachedScan(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

/** Replaces the saved scan. A failed write never fails the scan itself. */
export async function saveScanCache(query: ScanQuery, scan: ScanResponse): Promise<void> {
  const entry: CachedScan = { version: 1, savedAt: new Date().toISOString(), query, scan };
  const tmp = `${CACHE_FILE}.${process.pid}.${Date.now()}.tmp`;
  try {
    await mkdir(CACHE_DIR, { recursive: true });
    // Write then rename, so a reader never sees a half-written file.
    await writeFile(tmp, JSON.stringify(entry));
    await rename(tmp, CACHE_FILE);
  } catch (err) {
    console.warn("[ccusage-viewer] could not save the scan cache:", err);
  }
}

// Shared through globalThis: instrumentation and route handlers may be bundled separately.
const refreshState = globalThis as { __ccusageCacheRefreshing?: boolean };

export function isCacheRefreshing(): boolean {
  return refreshState.__ccusageCacheRefreshing === true;
}

export function setCacheRefreshing(value: boolean): void {
  refreshState.__ccusageCacheRefreshing = value;
}
