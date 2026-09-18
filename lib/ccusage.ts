export const VIEWS = ["daily", "weekly", "monthly", "session", "blocks"] as const;
export type ViewKey = (typeof VIEWS)[number];

export interface ModelBreakdown {
  modelName: string;
  inputTokens: number;
  outputTokens: number;
  cacheCreationTokens: number;
  cacheReadTokens: number;
  cost: number;
}

export interface CcusageRow {
  agent: string;
  period: string;
  inputTokens: number;
  outputTokens: number;
  cacheCreationTokens: number;
  cacheReadTokens: number;
  totalTokens: number;
  totalCost: number;
  modelsUsed: string[];
  modelBreakdowns: ModelBreakdown[];
  metadata?: Record<string, unknown>;
}

export interface CcusageTotals {
  totalCost: number;
  totalTokens: number;
  inputTokens: number;
  outputTokens: number;
  cacheCreationTokens: number;
  cacheReadTokens: number;
}

export interface ScanResponse {
  view: ViewKey;
  rows: CcusageRow[];
  totals: CcusageTotals;
  scannedAt: string;
  /** Engine provenance. Optional so older cached responses still satisfy the type. */
  engine?: ScanEngine;
}

export interface ScanEngine {
  /** Package spec actually executed, e.g. "ccusage@20.0.23". */
  spec: string;
  /**
   * True when spec was pinned to the registry's `latest` at scan time.
   * False means the registry was unreachable and npx fell back to the
   * `ccusage@latest` tag, which may serve a stale cache entry.
   */
  pinned: boolean;
  /** Resolved version when pinned; null when unverified (fallback path). */
  version: string | null;
}

export function isViewKey(v: string): v is ViewKey {
  return (VIEWS as readonly string[]).includes(v);
}

const DATE_RE = /^(\d{4})-?(\d{2})-?(\d{2})$/;

export function isDateParam(v: string): boolean {
  const m = DATE_RE.exec(v);
  if (!m) return false;
  const y = Number(m[1]);
  const mo = Number(m[2]);
  const d = Number(m[3]);
  if (mo < 1 || mo > 12 || d < 1 || d > 31) return false;
  const dt = new Date(Date.UTC(y, mo - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === mo - 1 && dt.getUTCDate() === d;
}

export function normalizeDateParam(v: string): string {
  return v.replaceAll("-", "");
}
