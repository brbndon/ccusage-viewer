import { NextRequest, NextResponse } from "next/server";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { isDateParam, isViewKey, normalizeDateParam, type ScanResponse } from "@/lib/ccusage";

const execFileAsync = promisify(execFile);

export const dynamic = "force-dynamic";

const ZERO_TOTALS: ScanResponse["totals"] = {
  totalCost: 0, totalTokens: 0, inputTokens: 0,
  outputTokens: 0, cacheCreationTokens: 0, cacheReadTokens: 0,
};

function isTotals(v: unknown): v is ScanResponse["totals"] {
  if (typeof v !== "object" || v === null) return false;
  const t = v as Record<string, unknown>;
  return ["totalCost", "totalTokens", "inputTokens", "outputTokens", "cacheCreationTokens", "cacheReadTokens"]
    .every((k) => typeof t[k] === "number" && Number.isFinite(t[k]));
}

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const viewRaw = url.searchParams.get("view") ?? "daily";
  const since = url.searchParams.get("since") ?? "";
  const until = url.searchParams.get("until") ?? "";

  if (!isViewKey(viewRaw)) {
    return NextResponse.json({ error: `Invalid view: ${viewRaw}` }, { status: 400 });
  }
  if (since && !isDateParam(since)) {
    return NextResponse.json({ error: `Invalid since: ${since}` }, { status: 400 });
  }
  if (until && !isDateParam(until)) {
    return NextResponse.json({ error: `Invalid until: ${until}` }, { status: 400 });
  }
  if (since && until && normalizeDateParam(since) > normalizeDateParam(until)) {
    return NextResponse.json({ error: `Invalid range: since ${since} is after until ${until}` }, { status: 400 });
  }

  const args = ["ccusage", viewRaw, "--json"];
  if (since) args.push("--since", since);
  if (until) args.push("--until", until);

  try {
    const { stdout } = await execFileAsync("npx", args, { timeout: 30000, maxBuffer: 32 * 1024 * 1024 });
    const parsed = JSON.parse(stdout) as Record<string, unknown>;
    const rawRows = parsed[viewRaw];
    if (!Array.isArray(rawRows)) {
      throw new Error(`unexpected ccusage shape: missing "${viewRaw}" array`);
    }
    const rows = rawRows as ScanResponse["rows"];
    const rawTotals = parsed["totals"];
    const totals = rawTotals === undefined ? ZERO_TOTALS
      : isTotals(rawTotals) ? rawTotals
      : (() => { throw new Error("unexpected ccusage shape: malformed totals"); })();
    const body: ScanResponse = { view: viewRaw, rows, totals, scannedAt: new Date().toISOString() };
    return NextResponse.json(body);
  } catch (err: unknown) {
    const e = err as { killed?: boolean; stderr?: string; message?: string };
    const timedOut = e?.killed === true;
    const detail = String(e?.stderr ?? e?.message ?? err).slice(0, 500);
    return NextResponse.json(
      { error: timedOut ? "ccusage timed out after 30s" : "ccusage failed", detail },
      { status: timedOut ? 504 : 500 }
    );
  }
}
