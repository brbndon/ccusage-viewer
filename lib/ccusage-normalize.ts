import type {
  CcusageRow,
  CcusageTotals,
  ModelBreakdown,
  ProviderSlug,
  ViewKey,
} from "./ccusage";
import { isRow, isTotals, ZERO_TOTALS } from "./ccusage";

export interface ProviderScanResult {
  provider: ProviderSlug;
  rows: CcusageRow[];
  totals: CcusageTotals;
}

export function normalizeProviderRow(
  provider: ProviderSlug,
  view: ViewKey,
  rawRow: unknown
): CcusageRow {
  if (typeof rawRow !== "object" || rawRow === null) {
    return {
      agent: provider,
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

  let period = "";
  if (typeof r.period === "string" && r.period.length > 0) {
    period = r.period;
  } else if (typeof r.date === "string" && r.date.length > 0) {
    period = r.date;
  } else if (typeof r.sessionId === "string" && r.sessionId.length > 0) {
    period = r.sessionId;
  }

  const agent =
    typeof r.agent === "string" && r.agent.length > 0 ? r.agent : provider;

  const inputTokens =
    typeof r.inputTokens === "number" && Number.isFinite(r.inputTokens)
      ? r.inputTokens
      : 0;
  const outputTokens =
    typeof r.outputTokens === "number" && Number.isFinite(r.outputTokens)
      ? r.outputTokens
      : 0;
  const cacheCreationTokens =
    typeof r.cacheCreationTokens === "number" &&
    Number.isFinite(r.cacheCreationTokens)
      ? r.cacheCreationTokens
      : 0;
  const cacheReadTokens =
    typeof r.cacheReadTokens === "number" && Number.isFinite(r.cacheReadTokens)
      ? r.cacheReadTokens
      : 0;

  const totalTokens =
    typeof r.totalTokens === "number" && Number.isFinite(r.totalTokens)
      ? r.totalTokens
      : inputTokens + outputTokens + cacheCreationTokens + cacheReadTokens;

  let totalCost = 0;
  if (typeof r.totalCost === "number" && Number.isFinite(r.totalCost)) {
    totalCost = r.totalCost;
  } else if (typeof r.costUSD === "number" && Number.isFinite(r.costUSD)) {
    totalCost = r.costUSD;
  }

  let modelsUsed: string[] = [];
  let modelBreakdowns: ModelBreakdown[] = [];

  // Dialect 2/3: models object map (e.g. Codex)
  if (typeof r.models === "object" && r.models !== null && !Array.isArray(r.models)) {
    const modelsObj = r.models as Record<string, Record<string, unknown>>;
    modelsUsed = Object.keys(modelsObj);
    modelBreakdowns = Object.entries(modelsObj).map(([modelName, m]) => {
      const mInput =
        typeof m?.inputTokens === "number" && Number.isFinite(m.inputTokens)
          ? m.inputTokens
          : 0;
      const mOutput =
        typeof m?.outputTokens === "number" && Number.isFinite(m.outputTokens)
          ? m.outputTokens
          : 0;
      const mCacheCreation =
        typeof m?.cacheCreationTokens === "number" &&
        Number.isFinite(m.cacheCreationTokens)
          ? m.cacheCreationTokens
          : 0;
      const mCacheRead =
        typeof m?.cacheReadTokens === "number" &&
        Number.isFinite(m.cacheReadTokens)
          ? m.cacheReadTokens
          : 0;
      const mTotal =
        typeof m?.totalTokens === "number" && Number.isFinite(m.totalTokens)
          ? m.totalTokens
          : mInput + mOutput + mCacheCreation + mCacheRead;
      const cost =
        totalTokens > 0 ? (mTotal / totalTokens) * totalCost : 0;
      return {
        modelName,
        inputTokens: mInput,
        outputTokens: mOutput,
        cacheCreationTokens: mCacheCreation,
        cacheReadTokens: mCacheRead,
        cost,
      };
    });
  } else {
    // Dialect 1: Unified / OpenCode style
    if (Array.isArray(r.modelsUsed)) {
      modelsUsed = r.modelsUsed.map(String);
    }
    if (Array.isArray(r.modelBreakdowns)) {
      modelBreakdowns = r.modelBreakdowns.map((b) => {
        const item = (typeof b === "object" && b !== null ? b : {}) as Record<
          string,
          unknown
        >;
        return {
          modelName:
            typeof item.modelName === "string" ? item.modelName : "unknown",
          inputTokens:
            typeof item.inputTokens === "number" &&
            Number.isFinite(item.inputTokens)
              ? item.inputTokens
              : 0,
          outputTokens:
            typeof item.outputTokens === "number" &&
            Number.isFinite(item.outputTokens)
              ? item.outputTokens
              : 0,
          cacheCreationTokens:
            typeof item.cacheCreationTokens === "number" &&
            Number.isFinite(item.cacheCreationTokens)
              ? item.cacheCreationTokens
              : 0,
          cacheReadTokens:
            typeof item.cacheReadTokens === "number" &&
            Number.isFinite(item.cacheReadTokens)
              ? item.cacheReadTokens
              : 0,
          cost:
            typeof item.cost === "number" && Number.isFinite(item.cost)
              ? item.cost
              : 0,
        };
      });
    }
  }

  const metadata: Record<string, unknown> =
    typeof r.metadata === "object" && r.metadata !== null
      ? { ...(r.metadata as Record<string, unknown>) }
      : {};

  if (r.sessionId && metadata.sessionId === undefined) {
    metadata.sessionId = r.sessionId;
  }
  if (r.lastActivity && metadata.lastActivity === undefined) {
    metadata.lastActivity = r.lastActivity;
  }

  const result: CcusageRow = {
    agent,
    period,
    inputTokens,
    outputTokens,
    cacheCreationTokens,
    cacheReadTokens,
    totalTokens,
    totalCost,
    modelsUsed,
    modelBreakdowns,
  };

  if (Object.keys(metadata).length > 0) {
    result.metadata = metadata;
  }

  return result;
}

export function normalizeProviderTotals(rawTotals: unknown): CcusageTotals {
  if (rawTotals === undefined || rawTotals === null) {
    return ZERO_TOTALS;
  }
  if (typeof rawTotals !== "object") {
    throw new Error("unexpected ccusage shape: malformed totals");
  }

  const t = { ...(rawTotals as Record<string, unknown>) };
  if (t.totalCost === undefined && typeof t.costUSD === "number") {
    t.totalCost = t.costUSD;
  }

  if (isTotals(t)) {
    return t;
  }

  throw new Error("unexpected ccusage shape: malformed totals");
}

export function normalizeProviderPayload(
  provider: ProviderSlug,
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

  const normalizedRows = rawRows.map((r) =>
    normalizeProviderRow(provider, view, r)
  );
  const rows = normalizedRows.filter(isRow);

  if (rawRows.length > 0 && rows.length === 0) {
    throw new Error(
      `unexpected ccusage shape: ${rawRows.length} "${view}" rows failed validation`
    );
  }

  const totals = normalizeProviderTotals(obj["totals"]);

  return { rows, totals };
}

export function mergeScanResults(
  results: ProviderScanResult[],
  view: ViewKey,
  requestedProviders: ProviderSlug[]
): { rows: CcusageRow[]; totals: CcusageTotals } {
  const totals: CcusageTotals = {
    totalCost: 0,
    totalTokens: 0,
    inputTokens: 0,
    outputTokens: 0,
    cacheCreationTokens: 0,
    cacheReadTokens: 0,
  };

  for (const r of results) {
    totals.totalCost += r.totals.totalCost;
    totals.totalTokens += r.totals.totalTokens;
    totals.inputTokens += r.totals.inputTokens;
    totals.outputTokens += r.totals.outputTokens;
    totals.cacheCreationTokens += r.totals.cacheCreationTokens;
    totals.cacheReadTokens += r.totals.cacheReadTokens;
  }

  if (view === "blocks") {
    return { rows: results.flatMap((r) => r.rows), totals };
  }

  if (view === "session") {
    const rows: CcusageRow[] = [];
    for (const reqProvider of requestedProviders) {
      const found = results.find((res) => res.provider === reqProvider);
      if (found) {
        rows.push(...found.rows);
      }
    }
    return { rows, totals };
  }

  // daily, weekly, monthly: group by period
  interface GroupedRow {
    period: string;
    inputTokens: number;
    outputTokens: number;
    cacheCreationTokens: number;
    cacheReadTokens: number;
    totalTokens: number;
    totalCost: number;
    modelsUsed: string[];
    modelBreakdownMap: Map<string, ModelBreakdown>;
  }

  const groups = new Map<string, GroupedRow>();

  for (const reqProvider of requestedProviders) {
    const found = results.find((res) => res.provider === reqProvider);
    if (!found) continue;

    for (const row of found.rows) {
      const p = row.period;
      let g = groups.get(p);
      if (!g) {
        g = {
          period: p,
          inputTokens: 0,
          outputTokens: 0,
          cacheCreationTokens: 0,
          cacheReadTokens: 0,
          totalTokens: 0,
          totalCost: 0,
          modelsUsed: [],
          modelBreakdownMap: new Map(),
        };
        groups.set(p, g);
      }

      g.inputTokens += row.inputTokens;
      g.outputTokens += row.outputTokens;
      g.cacheCreationTokens += row.cacheCreationTokens;
      g.cacheReadTokens += row.cacheReadTokens;
      g.totalTokens += row.totalTokens;
      g.totalCost += row.totalCost;

      for (const m of row.modelsUsed ?? []) {
        if (!g.modelsUsed.includes(m)) {
          g.modelsUsed.push(m);
        }
      }

      for (const b of row.modelBreakdowns ?? []) {
        const existing = g.modelBreakdownMap.get(b.modelName);
        if (existing) {
          existing.inputTokens += b.inputTokens;
          existing.outputTokens += b.outputTokens;
          existing.cacheCreationTokens += b.cacheCreationTokens;
          existing.cacheReadTokens += b.cacheReadTokens;
          existing.cost += b.cost;
        } else {
          g.modelBreakdownMap.set(b.modelName, { ...b });
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
    modelsUsed: g.modelsUsed,
    modelBreakdowns: Array.from(g.modelBreakdownMap.values()),
    metadata: { agents: requestedProviders },
  }));

  mergedRows.sort((a, b) => a.period.localeCompare(b.period));

  return { rows: mergedRows, totals };
}
