import type { CcusageRow, CcusageTotals, ScanWarning, ViewKey } from "@/lib/ccusage";
import {
  agentLabel, agentTotalsOfRow, breakdownTokens, rollupAgents, totalsFromBreakdowns,
  totalsFromRows, unallocatedModelUsage, ZERO_TOTALS,
} from "@/lib/ccusage";
import { formatChartMoney } from "@/lib/model-meta";

export interface ExportContext {
  warnings?: ScanWarning[];
  modelFilterApplied?: boolean;
  excludedModelUsage?: CcusageTotals;
}

interface SummaryOptions extends ExportContext {
  rows: CcusageRow[];
  totals: CcusageTotals;
  view: ViewKey;
  scannedAt: string;
  rangeLabel: string;
  providersLabel: string;
  includedProvidersLabel: string;
}

function csvCell(value: string | number): string {
  let text = String(value);
  if (typeof value === "string" && /^[\s]*[=+\-@]/.test(text)) text = `'${text}`;
  return `"${text.replaceAll('"', '""')}"`;
}

function modelFilterNote({ modelFilterApplied, excludedModelUsage }: ExportContext): string {
  if (!modelFilterApplied) return "";
  const excluded = excludedModelUsage ?? ZERO_TOTALS;
  return `Model filter applied. Usage without model attribution excluded: ${excluded.totalTokens.toLocaleString("en-US")} tokens, ${formatChartMoney(excluded.totalCost)}.`;
}

export function buildUsageCsv(rows: CcusageRow[], context: ExportContext = {}): string {
  const warnings = context.warnings ?? [];
  const status = warnings.length ? "partial" : "complete";
  const failed = warnings.map((w) => w.provider).join("; ");
  const notes = [modelFilterNote(context), ...warnings.map((w) => `${w.provider}: ${w.error}`)]
    .filter(Boolean).join(" ");
  const lines = [[
    "Period", "Provider", "Model", "Input Tokens", "Output Tokens",
    "Cache Create Tokens", "Cache Read Tokens", "Reported Reasoning Tokens (included in Output)",
    "Total Tokens", "Cost USD", "Cost Estimated", "Row Type", "Scan Status",
    "Failed Providers", "Notes",
  ].map(csvCell).join(",")];

  function append(period: string, agent: string, model: string, totals: CcusageTotals, type: string, note = "") {
    lines.push([
      period, agent, model, totals.inputTokens, totals.outputTokens,
      totals.cacheCreationTokens, totals.cacheReadTokens, totals.reasoningOutputTokens ?? 0,
      totals.totalTokens, totals.totalCost, totals.costEstimated ? "yes" : "no",
      type, status, failed, [notes, note].filter(Boolean).join(" "),
    ].map(csvCell).join(","));
  }

  for (const row of rows) {
    if (!row.modelBreakdowns.length) {
      for (const a of agentTotalsOfRow(row)) {
        append(row.period, a.agent, row.modelsUsed.join("; "), a, "aggregate", "No per-model split available.");
      }
      continue;
    }
    for (const b of row.modelBreakdowns) {
      append(row.period, b.agent ?? row.agent, b.modelName, totalsFromBreakdowns([b]), "model");
    }
    for (const rest of unallocatedModelUsage(row)) {
      append(row.period, rest.agent, "Unallocated to a model", rest, "unallocated", "Included in agent totals; model attribution unavailable.");
    }
  }
  // Keep failed-provider information even when the successful scan has no rows.
  for (const w of warnings) append("", w.provider, "", ZERO_TOTALS, "warning", w.error);
  return lines.join("\r\n");
}

export function buildUsageMarkdown({
  rows, totals, view, scannedAt, rangeLabel, providersLabel, includedProvidersLabel,
  warnings = [], modelFilterApplied, excludedModelUsage,
}: SummaryOptions): string {
  const models = new Map<string, { cost: number; tokens: number; estimated: boolean }>();
  for (const row of rows) {
    for (const b of row.modelBreakdowns) {
      const current = models.get(b.modelName) ?? { cost: 0, tokens: 0, estimated: false };
      current.cost += b.cost;
      current.estimated ||= b.costEstimated === true;
      current.tokens += breakdownTokens(b);
      models.set(b.modelName, current);
    }
  }
  const modelLines = [...models.entries()].sort((a, b) => b[1].cost - a[1].cost).slice(0, 10)
    .map(([name, model]) => `| ${name.replaceAll("|", "\\|")} | ${model.estimated ? "≈ " : ""}${formatChartMoney(model.cost)} | ${model.tokens.toLocaleString("en-US")} |`);
  const hasEstimates = totals.costEstimated || [...models.values()].some((m) => m.estimated);
  const unallocated = totalsFromRows(rows.flatMap(unallocatedModelUsage));
  const agentLines = rollupAgents(rows).map((a) =>
    `| ${agentLabel(a.agent)} | ${a.costEstimated ? "≈ " : ""}${formatChartMoney(a.cost)} | ${a.tokens.toLocaleString("en-US")} |`);
  const filterNote = modelFilterNote({ modelFilterApplied, excludedModelUsage });

  return [
    "# ccusage Summary", "",
    `- View: ${view}`,
    `- Providers requested: ${providersLabel}`,
    `- Providers included: ${includedProvidersLabel}`,
    `- Range: ${rangeLabel}`,
    `- Scanned: ${new Date(scannedAt).toLocaleString()}`,
    `- Periods: ${rows.length}`,
    `- Total spend: ${totals.costEstimated ? "≈ " : ""}${formatChartMoney(totals.totalCost)}`,
    `- Total tokens: ${totals.totalTokens.toLocaleString("en-US")}`,
    ...(warnings.length ? ["", "**Partial results — failed providers are excluded:**",
      ...warnings.map((w) => `- ${agentLabel(w.provider)}: ${w.error.replace(/\s+/g, " ")}`)] : []),
    ...(filterNote ? ["", filterNote] : []),
    "", "## Token breakdown", "",
    "| Type | Tokens |", "| --- | ---: |",
    `| Input | ${totals.inputTokens.toLocaleString("en-US")} |`,
    `| Output | ${totals.outputTokens.toLocaleString("en-US")} |`,
    `| Cache create | ${totals.cacheCreationTokens.toLocaleString("en-US")} |`,
    `| Cache read | ${totals.cacheReadTokens.toLocaleString("en-US")} |`,
    `| Reported reasoning (included in output) | ${(totals.reasoningOutputTokens ?? 0).toLocaleString("en-US")} |`,
    ...(agentLines.length ? ["", "## Spend by agent", "", "| Agent | Cost | Tokens |", "| --- | ---: | ---: |", ...agentLines] : []),
    ...(modelLines.length ? ["", "## Spend by model", "", "| Model | Cost | Tokens |", "| --- | ---: | ---: |", ...modelLines] : []),
    ...(unallocated.totalTokens || unallocated.totalCost ? ["",
      `Included in agent totals but not attributed to a model: ${unallocated.totalTokens.toLocaleString("en-US")} tokens, ${formatChartMoney(unallocated.totalCost)}.`] : []),
    ...(hasEstimates ? ["", "≈ Estimated: Codex model costs are split from period cost by token share; totals and rates derived from those splits are estimates."] : []),
  ].join("\n");
}
