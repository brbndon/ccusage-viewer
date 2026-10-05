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
  reasoningOutputTokens?: number;
  /** Canonical token total; Codex reasoning is already included in output. */
  totalTokens?: number;
  cost: number;
  /** Agent (provider slug) that produced this usage, when known. */
  agent?: string;
  /**
   * True when ccusage only reported cost for the whole row and this model's
   * share was split by token count (Codex-style output). Not an exact price.
   */
  costEstimated?: boolean;
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
  reasoningOutputTokens?: number;
  costEstimated?: boolean;
  /** Source agent totals, independent of incomplete model breakdowns. */
  agentTotals?: AgentUsage[];
  modelsUsed: string[];
  modelBreakdowns: ModelBreakdown[];
  /** ISO time used to order session (last activity) and blocks (start) rows. */
  timestamp?: string;
  metadata?: Record<string, unknown>;
}

export interface CcusageTotals {
  totalCost: number;
  totalTokens: number;
  inputTokens: number;
  outputTokens: number;
  cacheCreationTokens: number;
  cacheReadTokens: number;
  reasoningOutputTokens?: number;
  costEstimated?: boolean;
}

export interface AgentUsage extends CcusageTotals {
  agent: string;
}

export interface ScanEngine {
  /** Package spec actually executed, e.g. "ccusage@20.0.26". */
  spec: string;
  /** Version installed in node_modules (pinned in package.json). */
  version: string;
}

/** A provider whose scan failed; the rest of the scan still succeeded. */
export interface ScanWarning {
  provider: string;
  error: string;
}

export interface ScanResponse {
  view: ViewKey;
  rows: CcusageRow[];
  totals: CcusageTotals;
  scannedAt: string;
  /** Engine provenance. Optional so older cached responses still satisfy the type. */
  engine?: ScanEngine;
  providers?: string[];
  /** Providers that failed during a scoped scan and are missing from the results. */
  warnings?: ScanWarning[];
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
  reasoningOutputTokens: 0,
  costEstimated: false,
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

export function totalsFromRows(rows: readonly CcusageTotals[]): CcusageTotals {
  const totals = { ...ZERO_TOTALS };
  for (const r of rows) addTotals(totals, r);
  return totals;
}

export function addTotals(target: CcusageTotals, source: CcusageTotals): void {
  target.totalCost += source.totalCost;
  target.totalTokens += source.totalTokens;
  target.inputTokens += source.inputTokens;
  target.outputTokens += source.outputTokens;
  target.cacheCreationTokens += source.cacheCreationTokens;
  target.cacheReadTokens += source.cacheReadTokens;
  target.reasoningOutputTokens = (target.reasoningOutputTokens ?? 0) + (source.reasoningOutputTokens ?? 0);
  target.costEstimated ||= source.costEstimated === true;
}

export function breakdownTokens(b: ModelBreakdown): number {
  return b.totalTokens ?? b.inputTokens + b.outputTokens + b.cacheCreationTokens +
    b.cacheReadTokens;
}

export function totalsFromBreakdowns(breakdowns: ModelBreakdown[]): CcusageTotals {
  const totals = { ...ZERO_TOTALS };
  for (const b of breakdowns) {
    addTotals(totals, { ...b, totalCost: b.cost, totalTokens: breakdownTokens(b) });
  }
  return totals;
}

function remainder(total: CcusageTotals, allocated: CcusageTotals): CcusageTotals {
  const cost = total.totalCost - allocated.totalCost;
  return {
    totalCost: cost > 1e-9 ? cost : 0,
    totalTokens: Math.max(0, total.totalTokens - allocated.totalTokens),
    inputTokens: Math.max(0, total.inputTokens - allocated.inputTokens),
    outputTokens: Math.max(0, total.outputTokens - allocated.outputTokens),
    cacheCreationTokens: Math.max(0, total.cacheCreationTokens - allocated.cacheCreationTokens),
    cacheReadTokens: Math.max(0, total.cacheReadTokens - allocated.cacheReadTokens),
    reasoningOutputTokens: Math.max(0, (total.reasoningOutputTokens ?? 0) - (allocated.reasoningOutputTokens ?? 0)),
    costEstimated: total.costEstimated,
  };
}

/** Uses source totals; the fallback supports older responses without agentTotals. */
export function agentTotalsOfRow(row: CcusageRow): AgentUsage[] {
  if (row.agentTotals?.length) return row.agentTotals;
  if (row.agent && row.agent !== "all") return [{ ...totalsFromRows([row]), agent: row.agent }];
  const map = new Map<string, AgentUsage>();
  for (const b of row.modelBreakdowns ?? []) {
    const agent = b.agent ?? "unattributed";
    const entry = map.get(agent) ?? { ...ZERO_TOTALS, agent };
    addTotals(entry, totalsFromBreakdowns([b]));
    map.set(agent, entry);
  }
  const allocated = { ...ZERO_TOTALS };
  for (const entry of map.values()) addTotals(allocated, entry);
  const rest = remainder(row, allocated);
  if (rest.totalCost > 0 || rest.totalTokens > 0) {
    const entry = map.get("unattributed") ?? { ...ZERO_TOTALS, agent: "unattributed" };
    addTotals(entry, rest);
    map.set(entry.agent, entry);
  }
  return [...map.values()];
}

/** Usage that ccusage reports for an agent but cannot assign to a model. */
export function unallocatedModelUsage(row: CcusageRow): AgentUsage[] {
  return agentTotalsOfRow(row).map((total) => {
    const breakdowns = row.modelBreakdowns.filter((b) =>
      (b.agent ?? (row.agent === "all" ? "unattributed" : row.agent)) === total.agent);
    return { agent: total.agent, ...remainder(total, totalsFromBreakdowns(breakdowns)) };
  }).filter((r) => r.totalCost > 0 || r.totalTokens > 0);
}

export function filterRowsByModels(rows: CcusageRow[], selected: Set<string>): CcusageRow[] {
  return rows.flatMap((row) => {
    const kept = row.modelBreakdowns.filter((b) => selected.has(b.modelName));
    if (!kept.length) return [];
    const filtered: CcusageRow = {
      ...row,
      ...totalsFromBreakdowns(kept),
      modelsUsed: [...new Set(kept.map((b) => b.modelName))],
      modelBreakdowns: kept,
      agentTotals: undefined,
    };
    filtered.agentTotals = agentTotalsOfRow(filtered);
    return [filtered];
  });
}

/**
 * Chronological sort key. Calendar views sort by period; session and blocks
 * rows sort by timestamp, and rows without one sort first (oldest).
 */
export function rowSortKey(row: CcusageRow, view: ViewKey): string {
  if (view === "session" || view === "blocks") return row.timestamp ?? "";
  return row.period;
}

export function projectPathOf(row: CcusageRow): string | undefined {
  const projectPath = row.metadata?.projectPath;
  return typeof projectPath === "string" ? projectPath : undefined;
}

function formatTimestamp(iso: string): string | null {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return null;
  return date.toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

/** Human-readable label for a row's period in the given view. */
export function periodLabel(row: CcusageRow, view: ViewKey): string {
  if (view === "blocks") {
    const label = (row.timestamp && formatTimestamp(row.timestamp)) || row.period;
    return row.metadata?.isActive === true ? `${label} (active)` : label;
  }
  if (view === "session") {
    const label = row.timestamp && formatTimestamp(row.timestamp);
    if (label) return label;
    return row.period.length > 18 ? `${row.period.slice(0, 18)}…` : row.period;
  }
  return row.period;
}

export function periodNoun(view: ViewKey, count: number): string {
  const noun = view === "session" ? "session" : view === "blocks" ? "block" : "period";
  return count === 1 ? noun : `${noun}s`;
}

const AGENT_LABELS: Record<string, string> = {
  claude: "Claude Code",
  codex: "Codex",
  opencode: "OpenCode",
  copilot: "Copilot CLI",
  gemini: "Gemini CLI",
  openclaw: "OpenClaw",
  zcode: "ZCode",
  unattributed: "Unattributed",
  other: "Other",
};

export function agentLabel(agent: string): string {
  return AGENT_LABELS[agent] ?? agent.charAt(0).toUpperCase() + agent.slice(1);
}

export interface AgentRollup {
  agent: string;
  cost: number;
  tokens: number;
  costEstimated: boolean;
}

/**
 * Spend and tokens per agent within one row, including usage with no model split.
 */
export function agentSharesOfRow(row: CcusageRow): Map<string, AgentRollup> {
  const shares = new Map<string, AgentRollup>();
  for (const total of agentTotalsOfRow(row)) {
    const entry = shares.get(total.agent) ?? { agent: total.agent, cost: 0, tokens: 0, costEstimated: false };
    entry.cost += total.totalCost;
    entry.tokens += total.totalTokens;
    entry.costEstimated ||= total.costEstimated === true;
    shares.set(total.agent, entry);
  }
  return shares;
}

/** Spend and tokens per agent across rows, highest spend first. */
export function rollupAgents(rows: CcusageRow[]): AgentRollup[] {
  const map = new Map<string, AgentRollup>();
  for (const r of rows) {
    for (const [agent, share] of agentSharesOfRow(r)) {
      const entry = map.get(agent) ?? { agent, cost: 0, tokens: 0, costEstimated: false };
      entry.cost += share.cost;
      entry.tokens += share.tokens;
      entry.costEstimated ||= share.costEstimated;
      map.set(agent, entry);
    }
  }
  return [...map.values()].sort((a, b) => b.cost - a.cost);
}
