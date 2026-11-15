import { NextResponse } from "next/server";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import {
  type ProviderSlug,
  type ScanResponse,
  type ScanWarning,
  type ViewKey,
} from "@/lib/ccusage";
import {
  cleanDetail,
  resolveCcusage,
  type CcusageBinary,
} from "@/lib/ccusage-server";
import {
  mergeScanResults,
  normalizeProviderPayload,
  type ProviderScanResult,
} from "@/lib/ccusage-normalize";
import { saveScanCache } from "@/lib/scan-cache";

const execFileAsync = promisify(execFile);

const CCUSAGE_TIMEOUT_MS = 300_000;

/** Views where unified scans can attribute spend per agent via `--by-agent`. */
const BY_AGENT_VIEWS: readonly ViewKey[] = ["daily", "weekly", "monthly"];

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

function isTimeout(err: unknown): boolean {
  const e = err as { killed?: boolean; code?: string | number };
  return e?.killed === true || e?.code === "ETIMEDOUT";
}

export async function runCcusage(
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

export interface ScanParams {
  view: ViewKey;
  since: string;
  until: string;
  isAll: boolean;
  requestedProviders: ProviderSlug[];
}

export async function executeScan(
  { view: viewRaw, since, until, isAll, requestedProviders }: ScanParams,
  reqSignal: AbortSignal,
  onProvider?: (provider: ProviderSlug, ok: boolean, ms: number) => void
): Promise<NextResponse> {
  let binary: CcusageBinary;
  try {
    binary = await resolveCcusage();
  } catch {
    return NextResponse.json(
      {
        error: "ccusage is not installed. Run npm install.",
        code: "ccusage_missing",
        detail: "The ccusage CLI was not found in node_modules.",
      },
      { status: 500 }
    );
  }
  const { cliPath, engine } = binary;

  activeScan?.abort(new ScanSupersededError());
  const scanCtrl = new AbortController();
  activeScan = scanCtrl;
  const signal = AbortSignal.any([reqSignal, scanCtrl.signal]);
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
        await saveScanCache({ view: viewRaw, since, until, providers: "all" }, body);
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
        const providerStart = Date.now();
        try {
          const parsed = await runCcusage(
            cliPath,
            [provider, viewRaw, "--json", ...dateArgs],
            signal
          );
          const result = {
            provider,
            ...normalizeProviderPayload(provider, viewRaw, parsed),
          };
          onProvider?.(provider, true, Date.now() - providerStart);
          return result;
        } catch (childErr: unknown) {
          onProvider?.(provider, false, Date.now() - providerStart);
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
    await saveScanCache(
      { view: viewRaw, since, until, providers: requestedProviders },
      body
    );
    return NextResponse.json(body);
  } finally {
    if (activeScan === scanCtrl) activeScan = null;
  }
}
