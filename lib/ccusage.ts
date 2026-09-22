export const VIEWS = ["daily", "weekly", "monthly", "session", "blocks"] as const;
export type ViewKey = (typeof VIEWS)[number];

export const PROVIDERS = [
  "claude",
  "codex",
  "opencode",
  "amp",
  "droid",
  "codebuff",
  "hermes",
  "pi",
  "goose",
  "kilo",
  "copilot",
  "gemini",
  "antigravity",
  "kimi",
  "qwen",
  "openclaw",
  "grok",
  "zcode",
] as const;
export type ProviderSlug = (typeof PROVIDERS)[number];

export const VIEW_SUPPORT: Record<ProviderSlug, readonly ViewKey[]> = {
  claude: ["daily", "weekly", "monthly", "session", "blocks"],
  codex: ["daily", "monthly", "session"],
  opencode: ["daily", "weekly", "monthly", "session"],
  amp: ["daily", "monthly", "session"],
  droid: ["daily", "monthly", "session"],
  codebuff: ["daily", "monthly", "session"],
  hermes: ["daily", "monthly", "session"],
  pi: ["daily", "monthly", "session"],
  goose: ["daily", "monthly", "session"],
  kilo: ["daily", "monthly", "session"],
  copilot: ["daily", "monthly", "session"],
  gemini: ["daily", "monthly", "session"],
  antigravity: ["daily", "monthly", "session"],
  kimi: ["daily", "monthly", "session"],
  qwen: ["daily", "monthly", "session"],
  openclaw: ["daily", "monthly", "session"],
  grok: ["daily", "monthly", "session"],
  zcode: ["daily", "monthly", "session"],
};

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

export interface ScanResponse {
  view: ViewKey;
  rows: CcusageRow[];
  totals: CcusageTotals;
  scannedAt: string;
  /** Engine provenance. Optional so older cached responses still satisfy the type. */
  engine?: ScanEngine;
  providers?: string[];
  engines?: ScanEngine[];
}

export function isViewKey(v: string): v is ViewKey {
  return (VIEWS as readonly string[]).includes(v);
}

export function isProviderSlug(p: string): p is ProviderSlug {
  return (PROVIDERS as readonly string[]).includes(p);
}

export function isViewSupportedByProviders(view: ViewKey, providers: ProviderSlug[]): boolean {
  return providers.length > 0 && providers.every((p) => VIEW_SUPPORT[p]?.includes(view));
}

export const ZERO_TOTALS: CcusageTotals = {
  totalCost: 0,
  totalTokens: 0,
  inputTokens: 0,
  outputTokens: 0,
  cacheCreationTokens: 0,
  cacheReadTokens: 0,
};

export function isRow(v: unknown): v is CcusageRow {
  if (typeof v !== "object" || v === null) return false;
  const r = v as Record<string, unknown>;
  return (
    typeof r.period === "string" &&
    typeof r.totalCost === "number" &&
    Number.isFinite(r.totalCost) &&
    typeof r.totalTokens === "number" &&
    Number.isFinite(r.totalTokens)
  );
}

export function isTotals(v: unknown): v is CcusageTotals {
  if (typeof v !== "object" || v === null) return false;
  const t = v as Record<string, unknown>;
  return [
    "totalCost",
    "totalTokens",
    "inputTokens",
    "outputTokens",
    "cacheCreationTokens",
    "cacheReadTokens",
  ].every((k) => typeof t[k] === "number" && Number.isFinite(t[k]));
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
