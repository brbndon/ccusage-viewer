import type { CcusageRow, CcusageTotals, ViewKey } from "@/lib/ccusage";
import { formatMoney } from "@/lib/model-meta";

interface SummaryOptions {
  rows: CcusageRow[];
  totals: CcusageTotals;
  view: ViewKey;
  scannedAt: string;
  rangeLabel: string;
  providersLabel: string;
}

function csvCell(value: string | number): string {
  let text = String(value);
  if (typeof value === "string" && /^[\s]*[=+\-@]/.test(text)) {
    text = `'${text}`;
  }
  return `"${text.replaceAll('"', '""')}"`;
}

export function buildUsageCsv(rows: CcusageRow[]): string {
  const lines = [[
    "Period",
    "Provider",
    "Model",
    "Input Tokens",
    "Output Tokens",
    "Cache Create Tokens",
    "Cache Read Tokens",
    "Total Tokens",
    "Cost USD",
  ].map(csvCell).join(",")];

  for (const row of rows) {
    const breakdowns = row.modelBreakdowns ?? [];
    if (breakdowns.length > 0) {
      for (const breakdown of breakdowns) {
        const tokenCount = breakdown.inputTokens + breakdown.outputTokens +
          breakdown.cacheCreationTokens + breakdown.cacheReadTokens;
        lines.push([
          row.period,
          row.agent,
          breakdown.modelName,
          breakdown.inputTokens,
          breakdown.outputTokens,
          breakdown.cacheCreationTokens,
          breakdown.cacheReadTokens,
          tokenCount,
          breakdown.cost,
        ].map(csvCell).join(","));
      }
      continue;
    }

    lines.push([
      row.period,
      row.agent,
      (row.modelsUsed ?? []).join("; "),
      row.inputTokens,
      row.outputTokens,
      row.cacheCreationTokens,
      row.cacheReadTokens,
      row.totalTokens,
      row.totalCost,
    ].map(csvCell).join(","));
  }

  return lines.join("\r\n");
}

export function buildUsageMarkdown({
  rows,
  totals,
  view,
  scannedAt,
  rangeLabel,
  providersLabel,
}: SummaryOptions): string {
  const models = new Map<string, { cost: number; tokens: number }>();
  for (const row of rows) {
    for (const breakdown of row.modelBreakdowns ?? []) {
      const current = models.get(breakdown.modelName) ?? { cost: 0, tokens: 0 };
      current.cost += breakdown.cost;
      current.tokens += breakdown.inputTokens + breakdown.outputTokens +
        breakdown.cacheCreationTokens + breakdown.cacheReadTokens;
      models.set(breakdown.modelName, current);
    }
  }

  const modelLines = [...models.entries()]
    .sort((a, b) => b[1].cost - a[1].cost)
    .slice(0, 10)
    .map(([name, model]) => `| ${name.replaceAll("|", "\\|")} | ${formatMoney(model.cost)} | ${model.tokens.toLocaleString("en-US")} |`);

  return [
    "# ccusage Summary",
    "",
    `- View: ${view}`,
    `- Providers: ${providersLabel}`,
    `- Range: ${rangeLabel}`,
    `- Scanned: ${new Date(scannedAt).toLocaleString()}`,
    `- Periods: ${rows.length}`,
    `- Total spend: ${formatMoney(totals.totalCost)}`,
    `- Total tokens: ${totals.totalTokens.toLocaleString("en-US")}`,
    "",
    "## Token breakdown",
    "",
    "| Type | Tokens |",
    "| --- | ---: |",
    `| Input | ${totals.inputTokens.toLocaleString("en-US")} |`,
    `| Output | ${totals.outputTokens.toLocaleString("en-US")} |`,
    `| Cache create | ${totals.cacheCreationTokens.toLocaleString("en-US")} |`,
    `| Cache read | ${totals.cacheReadTokens.toLocaleString("en-US")} |`,
    ...(modelLines.length > 0
      ? ["", "## Spend by model", "", "| Model | Cost | Tokens |", "| --- | ---: | ---: |", ...modelLines]
      : []),
  ].join("\n");
}
