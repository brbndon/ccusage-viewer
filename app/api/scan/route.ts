import { NextRequest, NextResponse } from "next/server";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import {
  isDateParam,
  isProviderSlug,
  isRow,
  isTotals,
  isViewKey,
  normalizeDateParam,
  PROVIDERS,
  type ProviderSlug,
  type ScanEngine,
  type ScanResponse,
  VIEW_SUPPORT,
  ZERO_TOTALS,
} from "@/lib/ccusage";
import {
  mergeScanResults,
  normalizeProviderPayload,
  type ProviderScanResult,
} from "@/lib/ccusage-normalize";

const execFileAsync = promisify(execFile);

export const dynamic = "force-dynamic";
export const maxDuration = 300;
const CCUSAGE_TIMEOUT_MS = 300_000;
/** Short budget for the registry version probe; the scan itself must never fail because of it. */
const REGISTRY_PROBE_TIMEOUT_MS = 15_000;

const DEFAULT_PROVIDERS: ProviderSlug[] = PROVIDERS.filter(
  (p) => p !== "antigravity"
);

const SEMVER_RE = /^\d+\.\d+\.\d+(-[0-9A-Za-z.-]+)?(\+[0-9A-Za-z.-]+)?$/;

class ProviderScanError extends Error {
  constructor(
    public provider: ProviderSlug,
    public override cause: unknown
  ) {
    super(`Provider ${provider} scan failed`);
    this.name = "ProviderScanError";
  }
}

// Strip ANSI escapes and collapse whitespace so stderr stays a safe,
// single-line detail string (server paths may otherwise leak verbatim).
function cleanDetail(err: unknown): string {
  const e = err as { stderr?: unknown; message?: unknown };
  const raw = e?.stderr ?? e?.message ?? err;
  return String(raw)
    .replace(/\u001b\[[0-9;]*m/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 1000);
}

// Best-effort exact pin of the registry `latest`: `npx ccusage@<exact>` must
// install that version or fail, so a warm npx cache entry cannot silently
// serve a stale binary. Falls back to the `ccusage@latest` tag when the
// registry is unreachable — the scan itself must never fail for this probe.
// The registry value is semver-validated before interpolation (defense in
// depth; execFile takes no shell, but the spec must still be well-formed).
async function resolveSpec(
  signal: AbortSignal
): Promise<{ spec: string; pinned: boolean; version: string | null }> {
  try {
    const { stdout } = await execFileAsync("npm", ["view", "ccusage", "version"], {
      timeout: REGISTRY_PROBE_TIMEOUT_MS,
      maxBuffer: 64 * 1024,
      signal,
    });
    const latest = stdout.trim();
    if (SEMVER_RE.test(latest))
      return { spec: `ccusage@${latest}`, pinned: true, version: latest };
  } catch (e) {
    if (signal.aborted) throw e;
  }
  return { spec: "ccusage@latest", pinned: false, version: null };
}

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const viewRaw = url.searchParams.get("view") ?? "daily";
  const since = url.searchParams.get("since") ?? "";
  const until = url.searchParams.get("until") ?? "";
  const providersParam = url.searchParams.get("providers");

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
    return NextResponse.json(
      { error: `Invalid range: since ${since} is after until ${until}` },
      { status: 400 }
    );
  }

  const isAll = providersParam === "all";
  let requestedProviders: ProviderSlug[] = [];

  if (!isAll) {
    if (providersParam === null || providersParam === "") {
      requestedProviders = [...DEFAULT_PROVIDERS];
    } else {
      const rawSlugs = providersParam
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);
      if (rawSlugs.length === 0) {
        return NextResponse.json(
          { error: "No providers specified" },
          { status: 400 }
        );
      }
      const dedupedSlugs = Array.from(new Set(rawSlugs));
      for (const slug of dedupedSlugs) {
        if (!isProviderSlug(slug)) {
          return NextResponse.json(
            { error: `Unknown provider: ${slug}` },
            { status: 400 }
          );
        }
        requestedProviders.push(slug);
      }
    }

    // Validate view support against the requested providers
    for (const p of requestedProviders) {
      if (!VIEW_SUPPORT[p]?.includes(viewRaw)) {
        return NextResponse.json(
          { error: `view ${viewRaw} is not supported by provider ${p}` },
          { status: 400 }
        );
      }
    }
  }

  // Pin to the registry `latest` so a warm npx cache entry cannot silently
  // serve a stale binary. `--yes` suppresses the npx install prompt so
  // dev-server runs never hang waiting on stdin.
  const { spec, pinned, version } = await resolveSpec(req.signal);
  const engine: ScanEngine = { spec, pinned, version };
  const startedAt = Date.now();

  if (isAll) {
    const args = ["--yes", spec, viewRaw, "--json"];
    if (since) args.push("--since", since);
    if (until) args.push("--until", until);

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
        throw new Error(
          `unexpected ccusage shape: ${rawRows.length} "${viewRaw}" rows failed validation`
        );
      }
      const rawTotals = parsed["totals"];
      const totals =
        rawTotals === undefined
          ? ZERO_TOTALS
          : isTotals(rawTotals)
            ? rawTotals
            : (() => {
                throw new Error("unexpected ccusage shape: malformed totals");
              })();
      const body: ScanResponse = {
        view: viewRaw,
        rows,
        totals,
        scannedAt: new Date().toISOString(),
        engine,
        providers: ["all"],
        engines: [engine],
      };
      return NextResponse.json(body);
    } catch (err: unknown) {
      const e = err as {
        killed?: boolean;
        code?: string | number;
        stderr?: string;
        message?: string;
      };
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

  // Scoped scan: fan out concurrently with Promise.all
  try {
    const providerResults = await Promise.all(
      requestedProviders.map(async (provider): Promise<ProviderScanResult> => {
        const childArgs = ["--yes", spec, provider, viewRaw, "--json"];
        if (since) childArgs.push("--since", since);
        if (until) childArgs.push("--until", until);

        try {
          const { stdout } = await execFileAsync("npx", childArgs, {
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
          const parsed = JSON.parse(stdout);
          const { rows, totals } = normalizeProviderPayload(
            provider,
            viewRaw,
            parsed
          );
          return { provider, rows, totals };
        } catch (childErr: unknown) {
          throw new ProviderScanError(provider, childErr);
        }
      })
    );

    const { rows, totals } = mergeScanResults(
      providerResults,
      viewRaw,
      requestedProviders
    );

    const engines = requestedProviders.map(() => engine);
    const body: ScanResponse = {
      view: viewRaw,
      rows,
      totals,
      scannedAt: new Date().toISOString(),
      engine,
      providers: requestedProviders,
      engines,
    };
    return NextResponse.json(body);
  } catch (err: unknown) {
    const providerName =
      err instanceof ProviderScanError ? err.provider : undefined;
    const underlying = err instanceof ProviderScanError ? err.cause : err;
    const e = underlying as {
      killed?: boolean;
      code?: string | number;
      stderr?: string;
      message?: string;
    };
    const timedOut = e?.killed === true || e?.code === "ETIMEDOUT";
    const elapsedSec = Math.round((Date.now() - startedAt) / 1000);
    const rawDetail = cleanDetail(underlying);
    const detail = providerName
      ? `[provider: ${providerName}] ${rawDetail}`
      : rawDetail;
    return NextResponse.json(
      {
        error: timedOut
          ? `ccusage ${providerName ? `provider ${providerName} ` : ""}timed out after ${elapsedSec}s (budget ${CCUSAGE_TIMEOUT_MS / 1000}s)`
          : `ccusage ${providerName ? `provider ${providerName} ` : ""}failed`.trim(),
        detail,
      },
      { status: timedOut ? 504 : 500 }
    );
  }
}
