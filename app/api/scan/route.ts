import { NextRequest, NextResponse } from "next/server";
import { execFile } from "node:child_process";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import {
  isDateParam,
  isProviderSlug,
  isViewKey,
  normalizeDateParam,
  PROVIDERS,
  type ProviderSlug,
  type ScanEngine,
  type ScanResponse,
  type ScanWarning,
  type ViewKey,
  VIEW_SUPPORT,
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

const DEFAULT_PROVIDERS: ProviderSlug[] = PROVIDERS.filter(
  (p) => p !== "antigravity"
);

/** Views where unified scans can attribute spend per agent via `--by-agent`. */
const BY_AGENT_VIEWS: readonly ViewKey[] = ["daily", "weekly", "monthly"];

const LOCAL_HOSTNAMES = new Set(["localhost", "127.0.0.1", "[::1]"]);
const TRUSTED_FETCH_SITES = new Set(["same-origin", "none"]);

class ProviderScanError extends Error {
  constructor(
    public provider: ProviderSlug,
    public override cause: unknown
  ) {
    super(`Provider ${provider} scan failed`);
    this.name = "ProviderScanError";
  }
}

class ScanSupersededError extends Error {
  constructor() {
    super("Scan superseded by a newer scan");
    this.name = "ScanSupersededError";
  }
}

/**
 * The scan API runs local commands and returns private usage data, so only
 * same-origin requests addressed to a loopback host are served. This blocks
 * other devices on the network, other websites (CSRF), and DNS rebinding.
 */
function rejectUntrustedRequest(req: NextRequest): NextResponse | null {
  const host = req.headers.get("host") ?? "";
  let hostname = "";
  try {
    hostname = new URL(`http://${host}`).hostname;
  } catch {
    // Malformed Host header; rejected below.
  }
  if (!LOCAL_HOSTNAMES.has(hostname)) {
    return NextResponse.json(
      { error: "Forbidden: the scan API is only served on localhost" },
      { status: 403 }
    );
  }

  const fetchSite = req.headers.get("sec-fetch-site");
  if (fetchSite !== null && !TRUSTED_FETCH_SITES.has(fetchSite)) {
    return NextResponse.json(
      { error: "Forbidden: cross-site scan requests are not allowed" },
      { status: 403 }
    );
  }

  const origin = req.headers.get("origin");
  if (origin !== null) {
    let originHost = "";
    try {
      originHost = new URL(origin).host;
    } catch {
      // Malformed or opaque ("null") origin; rejected below.
    }
    if (originHost !== host) {
      return NextResponse.json(
        { error: "Forbidden: cross-origin scan requests are not allowed" },
        { status: 403 }
      );
    }
  }

  return null;
}

// Strip ANSI escapes and collapse whitespace so stderr stays a safe,
// single-line detail string (server paths may otherwise leak verbatim).
function cleanDetail(err: unknown): string {
  const e = err as { stderr?: unknown; message?: unknown };
  const raw = e?.stderr || e?.message || err;
  return String(raw)
    .replace(/\u001b\[[0-9;]*m/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 1000);
}

function isTimeout(err: unknown): boolean {
  const e = err as { killed?: boolean; code?: string | number };
  return e?.killed === true || e?.code === "ETIMEDOUT";
}

interface CcusageBinary {
  cliPath: string;
  engine: ScanEngine;
}

let binaryPromise: Promise<CcusageBinary> | null = null;

/**
 * Resolves the ccusage CLI installed from package.json. The exact version is
 * pinned with lockfile integrity hashes, so scans never download or execute
 * unreviewed releases. Update deliberately with `npm install ccusage@<version>`.
 */
function resolveCcusage(): Promise<CcusageBinary> {
  binaryPromise ??= (async () => {
    const packageDir = path.join(process.cwd(), "node_modules", "ccusage");
    const pkg = JSON.parse(
      await readFile(path.join(packageDir, "package.json"), "utf8")
    ) as { version?: unknown; bin?: unknown };
    const bin =
      typeof pkg.bin === "string"
        ? pkg.bin
        : (pkg.bin as Record<string, unknown> | undefined)?.ccusage;
    if (typeof pkg.version !== "string" || typeof bin !== "string") {
      throw new Error("node_modules/ccusage/package.json is missing version or bin");
    }
    return {
      cliPath: path.join(packageDir, bin),
      engine: { spec: `ccusage@${pkg.version}`, version: pkg.version },
    };
  })().catch((err) => {
    binaryPromise = null;
    throw err;
  });
  return binaryPromise;
}

async function runCcusage(
  cliPath: string,
  args: string[],
  signal: AbortSignal
): Promise<unknown> {
  const { stdout } = await execFileAsync(process.execPath, [cliPath, ...args], {
    timeout: CCUSAGE_TIMEOUT_MS,
    maxBuffer: 32 * 1024 * 1024,
    signal,
    env: { ...process.env, FORCE_COLOR: "0", NO_COLOR: "1" },
  });
  return JSON.parse(stdout);
}

function scanErrorResponse(
  err: unknown,
  startedAt: number,
  provider?: ProviderSlug
): NextResponse {
  if (err instanceof ScanSupersededError) {
    return NextResponse.json({ error: err.message }, { status: 409 });
  }
  const timedOut = isTimeout(err);
  const elapsedSec = Math.round((Date.now() - startedAt) / 1000);
  const label = provider ? `ccusage provider ${provider}` : "ccusage";
  const detail = cleanDetail(err);
  return NextResponse.json(
    {
      error: timedOut
        ? `${label} timed out after ${elapsedSec}s (budget ${CCUSAGE_TIMEOUT_MS / 1000}s)`
        : `${label} failed`,
      detail: provider ? `[provider: ${provider}] ${detail}` : detail,
    },
    { status: timedOut ? 504 : 500 }
  );
}

/** Only one scan runs at a time; a new scan cancels the previous one. */
let activeScan: AbortController | null = null;

export async function GET(req: NextRequest) {
  const rejection = rejectUntrustedRequest(req);
  if (rejection) return rejection;

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

  let binary: CcusageBinary;
  try {
    binary = await resolveCcusage();
  } catch (err) {
    return NextResponse.json(
      {
        error: "ccusage is not installed. Run npm install.",
        detail: cleanDetail(err),
      },
      { status: 500 }
    );
  }
  const { cliPath, engine } = binary;

  activeScan?.abort(new ScanSupersededError());
  const scanCtrl = new AbortController();
  activeScan = scanCtrl;
  const signal = AbortSignal.any([req.signal, scanCtrl.signal]);
  const startedAt = Date.now();
  const dateArgs = [
    ...(since ? ["--since", since] : []),
    ...(until ? ["--until", until] : []),
  ];

  try {
    if (isAll) {
      const args = [viewRaw, "--json", ...dateArgs];
      if (BY_AGENT_VIEWS.includes(viewRaw)) args.push("--by-agent");
      try {
        const parsed = await runCcusage(cliPath, args, signal);
        const { rows, totals } = normalizeProviderPayload("all", viewRaw, parsed);
        const body: ScanResponse = {
          view: viewRaw,
          rows,
          totals,
          scannedAt: new Date().toISOString(),
          engine,
          providers: ["all"],
        };
        return NextResponse.json(body);
      } catch (err: unknown) {
        return scanErrorResponse(
          scanCtrl.signal.aborted ? scanCtrl.signal.reason : err,
          startedAt
        );
      }
    }

    // Scoped scan: fan out concurrently; one failing provider must not hide
    // the others, so failures are reported as warnings.
    const settled = await Promise.allSettled(
      requestedProviders.map(async (provider): Promise<ProviderScanResult> => {
        try {
          const parsed = await runCcusage(
            cliPath,
            [provider, viewRaw, "--json", ...dateArgs],
            signal
          );
          return { provider, ...normalizeProviderPayload(provider, viewRaw, parsed) };
        } catch (childErr: unknown) {
          throw new ProviderScanError(provider, childErr);
        }
      })
    );

    if (scanCtrl.signal.aborted) {
      return scanErrorResponse(scanCtrl.signal.reason, startedAt);
    }

    const providerResults: ProviderScanResult[] = [];
    const failures: ProviderScanError[] = [];
    for (const result of settled) {
      if (result.status === "fulfilled") providerResults.push(result.value);
      else failures.push(result.reason as ProviderScanError);
    }

    if (providerResults.length === 0) {
      const first = failures[0];
      return scanErrorResponse(first.cause, startedAt, first.provider);
    }

    const warnings: ScanWarning[] = failures.map((f) => ({
      provider: f.provider,
      error: isTimeout(f.cause)
        ? `timed out (budget ${CCUSAGE_TIMEOUT_MS / 1000}s)`
        : cleanDetail(f.cause),
    }));

    const { rows, totals } = mergeScanResults(providerResults, viewRaw);
    const body: ScanResponse = {
      view: viewRaw,
      rows,
      totals,
      scannedAt: new Date().toISOString(),
      engine,
      providers: requestedProviders,
    };
    if (warnings.length > 0) body.warnings = warnings;
    return NextResponse.json(body);
  } finally {
    if (activeScan === scanCtrl) activeScan = null;
  }
}
