import type {
  CcusageRow,
  CcusageTotals,
  AgentUsage,
  ModelBreakdown,
  ViewKey,
} from "./ccusage";
import { addTotals, agentTotalsOfRow, breakdownTokens, isRow, isTotals, rowSortKey, totalsFromRows, ZERO_TOTALS } from "./ccusage";

export interface ProviderScanResult {
  provider: string;
  rows: CcusageRow[];
  totals: CcusageTotals;
}

function num(v: unknown): number {
  return typeof v === "number" && Number.isFinite(v) ? v : 0;
}

function nonEmptyString(v: unknown): string | undefined {
  return typeof v === "string" && v.length > 0 ? v : undefined;
}

function normalizeUsage(r: Record<string, unknown>): CcusageTotals {
  const tokenCounts = (r.tokenCounts ?? {}) as Record<string, unknown>;
  const metadata = (r.metadata ?? {}) as Record<string, unknown>;
  const inputTokens = num(r.inputTokens ?? tokenCounts.inputTokens);
  const outputTokens = num(r.outputTokens ?? tokenCounts.outputTokens);
  const cacheCreationTokens = num(r.cacheCreationTokens ?? tokenCounts.cacheCreationInputTokens);
  const cacheReadTokens = num(r.cacheReadTokens ?? tokenCounts.cacheReadInputTokens);
  const baseTokens = inputTokens + outputTokens + cacheCreationTokens + cacheReadTokens;
  // Codex reasoning is a subset of output, not another additive token category.
  // Unified calendar rows omit this detail; do not infer it from totalTokens.
  const reasoningOutputTokens = num(r.reasoningOutputTokens ?? metadata.reasoningOutputTokens);
  return {
    inputTokens, outputTokens, cacheCreationTokens, cacheReadTokens, reasoningOutputTokens,
    totalTokens: typeof r.totalTokens === "number" && Number.isFinite(r.totalTokens)
      ? r.totalTokens : baseTokens,
    totalCost: typeof r.totalCost === "number" && Number.isFinite(r.totalCost)
      ? r.totalCost : num(r.costUSD),
    costEstimated: false,
  };
}

function normalizeBreakdowns(raw: unknown, agent: string | undefined): ModelBreakdown[] {
  if (!Array.isArray(raw)) return [];
  return raw.map((b) => {
    const item = (typeof b === "object" && b !== null ? b : {}) as Record<string, unknown>;
    const breakdown: ModelBreakdown = {
      modelName: typeof item.modelName === "string" ? item.modelName : "unknown",
      inputTokens: num(item.inputTokens),
      outputTokens: num(item.outputTokens),
      cacheCreationTokens: num(item.cacheCreationTokens),
      cacheReadTokens: num(item.cacheReadTokens),
      reasoningOutputTokens: typeof item.reasoningOutputTokens === "number"
        ? num(item.reasoningOutputTokens) : undefined,
      cost: num(item.cost),
    };
    breakdown.totalTokens = typeof item.totalTokens === "number" && Number.isFinite(item.totalTokens)
      ? item.totalTokens : breakdownTokens(breakdown);
    if (agent) breakdown.agent = agent;
    return breakdown;
  });
}

/**
 * Normalizes one ccusage row. Handles the unified/Claude dialect
 * (`modelBreakdowns`), the Codex dialect (`models` object map, cost only per
 * row), unified `--by-agent` rows (`agents[]`), and Claude billing blocks
 * (`tokenCounts`, `models: string[]`, `startTime`).
 *
 * `agent` is the provider slug for scoped scans, or "all" for unified scans.
 */
export function normalizeProviderRow(
  agent: string,
  view: ViewKey,
  rawRow: unknown
): CcusageRow {
  if (typeof rawRow !== "object" || rawRow === null) {
    return {
      agent,
      period: "",
      inputTokens: 0,
      outputTokens: 0,
      cacheCreationTokens: 0,
      cacheReadTokens: 0,
      totalTokens: NaN,
      totalCost: NaN,
      modelsUsed: [],
      modelBreakdowns: [],
    };
  }
  const r = rawRow as Record<string, unknown>;
  const rawAgent = nonEmptyString(r.agent) ?? agent;
  const rowAgent = view === "blocks" && rawAgent === "all" ? "claude" : rawAgent;
  const metadata: Record<string, unknown> =
    typeof r.metadata === "object" && r.metadata !== null
      ? { ...(r.metadata as Record<string, unknown>) }
      : {};

  const period =
    nonEmptyString(r.period) ??
    nonEmptyString(r.date) ??
    nonEmptyString(r.week) ??
    nonEmptyString(r.month) ??
    nonEmptyString(r.sessionId) ??
    nonEmptyString(r.startTime) ??
    "";
  if (!period && (view === "daily" || view === "weekly" || view === "monthly")) {
    throw new Error(`unexpected ccusage shape: missing ${view} period`);
  }
  const usage = normalizeUsage(r);
  const { totalTokens, totalCost } = usage;
  let agentTotals: AgentUsage[] | undefined;

  // Breakdowns are only tagged with a concrete agent, never "all".
  const breakdownAgent = rowAgent === "all" ? undefined : rowAgent;
  let modelsUsed: string[] = [];
  let modelBreakdowns: ModelBreakdown[] = [];

  if (typeof r.models === "object" && r.models !== null && !Array.isArray(r.models)) {
    // Codex dialect: per-model tokens but cost only for the whole row, so each
    // model's cost is an estimate split by token share.
    const modelsObj = r.models as Record<string, Record<string, unknown>>;
    modelsUsed = Object.keys(modelsObj);
    modelBreakdowns = Object.entries(modelsObj).map(([modelName, m]) => {
      const mInput = num(m?.inputTokens);
      const mOutput = num(m?.outputTokens);
      const mCacheCreation = num(m?.cacheCreationTokens);
      const mCacheRead = num(m?.cacheReadTokens);
      const mReasoning = num(m?.reasoningOutputTokens);
      const mTotal =
        typeof m?.totalTokens === "number" && Number.isFinite(m.totalTokens)
          ? m.totalTokens
          : mInput + mOutput + mCacheCreation + mCacheRead;
      const breakdown: ModelBreakdown = {
        modelName,
        inputTokens: mInput,
        outputTokens: mOutput,
        cacheCreationTokens: mCacheCreation,
        cacheReadTokens: mCacheRead,
        reasoningOutputTokens: mReasoning,
        totalTokens: mTotal,
        cost: totalTokens > 0 ? (mTotal / totalTokens) * totalCost : 0,
        costEstimated: true,
      };
      if (breakdownAgent) breakdown.agent = breakdownAgent;
      return breakdown;
    });
  } else {
    if (Array.isArray(r.modelsUsed)) {
      modelsUsed = r.modelsUsed.map(String);
    } else if (Array.isArray(r.models)) {
      // Billing blocks list model names without a per-model breakdown.
      modelsUsed = r.models.map(String);
    }

    if (Array.isArray(r.agents)) {
      // Unified `--by-agent` rows carry exact per-agent model breakdowns.
      modelBreakdowns = r.agents.flatMap((a) => {
        const entry = (typeof a === "object" && a !== null ? a : {}) as Record<string, unknown>;
        return normalizeBreakdowns(entry.modelBreakdowns, nonEmptyString(entry.agent));
      });
      agentTotals = r.agents.map((a) => {
        const entry = (typeof a === "object" && a !== null ? a : {}) as Record<string, unknown>;
        const entryAgent = nonEmptyString(entry.agent) ?? "unattributed";
        return { agent: entryAgent, ...normalizeUsage(entry) };
      });
      usage.reasoningOutputTokens = agentTotals.reduce((sum, a) => sum + (a.reasoningOutputTokens ?? 0), 0);
    } else {
      modelBreakdowns = normalizeBreakdowns(r.modelBreakdowns, breakdownAgent);
    }
  }

  const sessionId = nonEmptyString(r.sessionId);
  if (sessionId && metadata.sessionId === undefined) metadata.sessionId = sessionId;
  for (const key of [
    "projectPath",
    "firstActivity",
    "lastActivity",
    "endTime",
    "actualEndTime",
    "isActive",
  ]) {
    if (r[key] !== undefined && r[key] !== null && metadata[key] === undefined) {
      metadata[key] = r[key];
    }
  }

  const timestamp =
    view === "blocks"
      ? nonEmptyString(r.startTime)
      : view === "session"
        ? nonEmptyString(metadata.lastActivity)
        : undefined;

  const result: CcusageRow = {
    ...usage,
    agent: rowAgent,
    period,
    modelsUsed,
    modelBreakdowns,
  };
  result.agentTotals = agentTotals?.length ? agentTotals : agentTotalsOfRow(result);
  if (timestamp) result.timestamp = timestamp;
  if (Object.keys(metadata).length > 0) result.metadata = metadata;

  return result;
}

/** ccusage omits totals for some reports (e.g. blocks); derive them from rows then. */
export function normalizeProviderTotals(
  rawTotals: unknown,
  rows: CcusageRow[]
): CcusageTotals {
  if (rawTotals === undefined || rawTotals === null) {
    return totalsFromRows(rows);
  }
  if (typeof rawTotals !== "object") {
    throw new Error("unexpected ccusage shape: malformed totals");
  }

  const t = { ...(rawTotals as Record<string, unknown>) };
  if (t.totalCost === undefined && typeof t.costUSD === "number") {
    t.totalCost = t.costUSD;
  }

  if (isTotals(t)) {
    return { ...t, reasoningOutputTokens: typeof t.reasoningOutputTokens === "number"
      ? t.reasoningOutputTokens : totalsFromRows(rows).reasoningOutputTokens, costEstimated: false };
  }

  throw new Error("unexpected ccusage shape: malformed totals");
}

export function sortRowsChronologically(rows: CcusageRow[], view: ViewKey): CcusageRow[] {
  return [...rows].sort((a, b) => rowSortKey(a, view).localeCompare(rowSortKey(b, view)));
}

export function normalizeProviderPayload(
  agent: string,
  view: ViewKey,
  parsedJson: unknown
): { rows: CcusageRow[]; totals: CcusageTotals } {
  if (typeof parsedJson !== "object" || parsedJson === null) {
    throw new Error("unexpected ccusage shape: root is not an object");
  }

  const obj = parsedJson as Record<string, unknown>;
  let rawRows = obj[view];
  if (rawRows === undefined && view === "session") {
    rawRows = obj["sessions"];
  }

  if (!Array.isArray(rawRows)) {
    throw new Error(`unexpected ccusage shape: missing "${view}" array`);
  }

  // Gap blocks are idle filler between billing blocks, not usage.
  const usageRows = rawRows.filter(
    (r) => !(typeof r === "object" && r !== null && (r as Record<string, unknown>).isGap === true)
  );
  const rows = usageRows
    .map((r) => normalizeProviderRow(agent, view, r))
    .filter(isRow);

  if (usageRows.length > 0 && rows.length === 0) {
    throw new Error(
      `unexpected ccusage shape: ${usageRows.length} "${view}" rows failed validation`
    );
  }

  const totals = normalizeProviderTotals(obj["totals"], rows);

  return { rows: sortRowsChronologically(rows, view), totals };
}

export function mergeScanResults(
  results: ProviderScanResult[],
  view: ViewKey
): { rows: CcusageRow[]; totals: CcusageTotals } {
  const totals: CcusageTotals = { ...ZERO_TOTALS };

  for (const r of results) {
    addTotals(totals, r.totals);
  }

  if (view === "blocks" || view === "session") {
    return {
      rows: sortRowsChronologically(results.flatMap((r) => r.rows), view),
      totals,
    };
  }

  // daily, weekly, monthly: group by period
  interface GroupedRow extends CcusageTotals {
    period: string;
    inputTokens: number;
    outputTokens: number;
    cacheCreationTokens: number;
    cacheReadTokens: number;
    totalTokens: number;
    totalCost: number;
    modelsUsed: string[];
    agents: string[];
    agentTotalMap: Map<string, AgentUsage>;
    /** Keyed by agent + model so per-agent spend survives the merge. */
    modelBreakdownMap: Map<string, ModelBreakdown>;
  }

  const groups = new Map<string, GroupedRow>();

  for (const found of results) {
    for (const row of found.rows) {
      const p = row.period;
      let g = groups.get(p);
      if (!g) {
        g = {
          ...ZERO_TOTALS,
          period: p,
          inputTokens: 0,
          outputTokens: 0,
          cacheCreationTokens: 0,
          cacheReadTokens: 0,
          totalTokens: 0,
          totalCost: 0,
          modelsUsed: [],
          agents: [],
          agentTotalMap: new Map(),
          modelBreakdownMap: new Map(),
        };
        groups.set(p, g);
      }

      addTotals(g, row);
      for (const a of agentTotalsOfRow(row)) {
        const entry = g.agentTotalMap.get(a.agent) ?? { ...ZERO_TOTALS, agent: a.agent };
        addTotals(entry, a);
        g.agentTotalMap.set(a.agent, entry);
      }
      if (!g.agents.includes(found.provider)) g.agents.push(found.provider);

      for (const m of row.modelsUsed ?? []) {
        if (!g.modelsUsed.includes(m)) {
          g.modelsUsed.push(m);
        }
      }

      for (const b of row.modelBreakdowns ?? []) {
        const agent = b.agent ?? found.provider;
        const key = `${agent}::${b.modelName}`;
        const existing = g.modelBreakdownMap.get(key);
        if (existing) {
          existing.totalTokens = breakdownTokens(existing) + breakdownTokens(b);
          existing.inputTokens += b.inputTokens;
          existing.outputTokens += b.outputTokens;
          existing.cacheCreationTokens += b.cacheCreationTokens;
          existing.cacheReadTokens += b.cacheReadTokens;
          existing.cost += b.cost;
          if (existing.reasoningOutputTokens !== undefined || b.reasoningOutputTokens !== undefined) {
            existing.reasoningOutputTokens = (existing.reasoningOutputTokens ?? 0) + (b.reasoningOutputTokens ?? 0);
          }
          existing.costEstimated ||= b.costEstimated;
        } else {
          g.modelBreakdownMap.set(key, { ...b, agent });
        }
      }
    }
  }

  const mergedRows: CcusageRow[] = Array.from(groups.values()).map((g) => ({
    agent: "all",
    period: g.period,
    inputTokens: g.inputTokens,
    outputTokens: g.outputTokens,
    cacheCreationTokens: g.cacheCreationTokens,
    cacheReadTokens: g.cacheReadTokens,
    totalTokens: g.totalTokens,
    totalCost: g.totalCost,
    reasoningOutputTokens: g.reasoningOutputTokens,
    costEstimated: g.costEstimated,
    agentTotals: [...g.agentTotalMap.values()],
    modelsUsed: g.modelsUsed,
    modelBreakdowns: Array.from(g.modelBreakdownMap.values()),
    metadata: { agents: g.agents },
  }));

  mergedRows.sort((a, b) => a.period.localeCompare(b.period));

  return { rows: mergedRows, totals };
}
