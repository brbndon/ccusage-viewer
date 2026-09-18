import { NextRequest, NextResponse } from "next/server";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { isDateParam, isViewKey, normalizeDateParam, type ScanResponse } from "@/lib/ccusage";

const execFileAsync = promisify(execFile);

export const dynamic = "force-dynamic";
// Scanning full local usage history is the slow part (measured ~60-120s wall
// time), so a 30s timeout guarantees spurious 504s. Give it headroom.
// NOTE: maxDuration is a no-op under `next dev` and exceeds the Vercel Hobby
// 60s cap — this viewer is local-dev-only, so 300 is safe here. Revisit if
// the route is ever deployed.
// `maxDuration` must be a literal export for Next to pick it up.
export const maxDuration = 300;
const CCUSAGE_TIMEOUT_MS = 300_000;
/** Short budget for the registry version probe; the scan itself must never fail because of it. */
const REGISTRY_PROBE_TIMEOUT_MS = 15_000;

const ZERO_TOTALS: ScanResponse["totals"] = {
  totalCost: 0, totalTokens: 0, inputTokens: 0,
  outputTokens: 0, cacheCreationTokens: 0, cacheReadTokens: 0,
};

const SEMVER_RE = /^\d+\.\d+\.\d+(-[0-9A-Za-z.-]+)?(\+[0-9A-Za-z.-]+)?$/;

// PeriodTable/CostChart only require period/totalCost/totalTokens to render
// (everything else degrades via `??` fallbacks), so validate exactly those.
function isRow(v: unknown): v is ScanResponse["rows"][number] {
  if (typeof v !== "object" || v === null) return false;
  const r = v as Record<string, unknown>;
  return typeof r.period === "string"
    && typeof r.totalCost === "number" && Number.isFinite(r.totalCost)
    && typeof r.totalTokens === "number" && Number.isFinite(r.totalTokens);
}

// Strip ANSI escapes and collapse whitespace so stderr stays a safe,
// single-line detail string (server paths may otherwise leak verbatim).
function cleanDetail(err: unknown): string {
  const e = err as { stderr?: unknown; message?: unknown };
  const raw = e?.stderr ?? e?.message ?? err;
  return String(raw).replace(/\u001b\[[0-9;]*m/g, "").replace(/\s+/g, " ").trim().slice(0, 1000);
}

// Best-effort exact pin of the registry `latest`: `npx ccusage@<exact>` must
// install that version or fail, so a warm npx cache entry cannot silently
// serve a stale binary. Falls back to the `ccusage@latest` tag when the
// registry is unreachable — the scan itself must never fail for this probe.
// The registry value is semver-validated before interpolation (defense in
// depth; execFile takes no shell, but the spec must still be well-formed).
async function resolveSpec(signal: AbortSignal): Promise<{ spec: string; pinned: boolean; version: string | null }> {
  try {
    const { stdout } = await execFileAsync("npm", ["view", "ccusage", "version"], {
      timeout: REGISTRY_PROBE_TIMEOUT_MS,
      maxBuffer: 64 * 1024,
      signal,
    });
    const latest = stdout.trim();
    if (SEMVER_RE.test(latest)) return { spec: `ccusage@${latest}`, pinned: true, version: latest };
  } catch (e) {
    if (signal.aborted) throw e;
  }
  return { spec: "ccusage@latest", pinned: false, version: null };
}

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

  // Pin to the registry `latest` so a warm npx cache entry cannot silently
  // serve a stale binary. `--yes` suppresses the npx install prompt so
  // dev-server runs never hang waiting on stdin.
  // `req.signal` is forwarded to every child process: a client Cancel (or a
  // superseding rescan, which aborts the previous fetch) kills the ~100s
  // ccusage run server-side instead of orphaning it.
  const { spec, pinned, version } = await resolveSpec(req.signal);
  const args = ["--yes", spec, viewRaw, "--json"];
  if (since) args.push("--since", since);
  if (until) args.push("--until", until);

  const startedAt = Date.now();
  try {
    const { stdout } = await execFileAsync("npx", args, {
      timeout: CCUSAGE_TIMEOUT_MS,
      maxBuffer: 32 * 1024 * 1024,
      signal: req.signal,
      env: {
        ...process.env,
        npm_config_yes: "true",
        NPM_CONFIG_UPDATE_NOTIFIER: "false",
        NO_UPDATE_NOTIFIER: "1",
        FORCE_COLOR: "0",
      },
    });
    const parsed = JSON.parse(stdout) as Record<string, unknown>;
    const rawRows = parsed[viewRaw];
    if (!Array.isArray(rawRows)) {
      throw new Error(`unexpected ccusage shape: missing "${viewRaw}" array`);
    }
    const rows = rawRows.filter(isRow);
    if (rawRows.length > 0 && rows.length === 0) {
      throw new Error(`unexpected ccusage shape: ${rawRows.length} "${viewRaw}" rows failed validation`);
    }
    const rawTotals = parsed["totals"];
    const totals = rawTotals === undefined ? ZERO_TOTALS
      : isTotals(rawTotals) ? rawTotals
      : (() => { throw new Error("unexpected ccusage shape: malformed totals"); })();
    const body: ScanResponse = {
      view: viewRaw,
      rows,
      totals,
      scannedAt: new Date().toISOString(),
      engine: { spec, pinned, version },
    };
    return NextResponse.json(body);
  } catch (err: unknown) {
    const e = err as { killed?: boolean; code?: string | number; stderr?: string; message?: string };
    const timedOut = e?.killed === true || e?.code === "ETIMEDOUT";
    const elapsedSec = Math.round((Date.now() - startedAt) / 1000);
    const detail = cleanDetail(err);
    return NextResponse.json(
      {
        error: timedOut
          ? `ccusage timed out after ${elapsedSec}s (budget ${CCUSAGE_TIMEOUT_MS / 1000}s)`
          : "ccusage failed",
        detail,
      },
      { status: timedOut ? 504 : 500 }
    );
  }
}
