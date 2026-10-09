import { NextRequest, NextResponse } from "next/server";
import { execFile } from "node:child_process";
import { access, readFile } from "node:fs/promises";
import os from "node:os";
import { createRequire } from "node:module";
import path from "node:path";
import { promisify } from "node:util";
import { PROVIDERS, type ProviderSlug, type ScanEngine } from "@/lib/ccusage";

const execFileAsync = promisify(execFile);
const requireFromHere = createRequire(import.meta.url);

const LOCAL_HOSTNAMES = new Set(["localhost", "127.0.0.1", "[::1]"]);
const TRUSTED_FETCH_SITES = new Set(["same-origin", "none"]);

/**
 * The scan API runs local commands and returns private usage data, so only
 * same-origin requests addressed to a loopback host are served. This blocks
 * other devices on the network, other websites (CSRF), and DNS rebinding.
 */
export function rejectUntrustedRequest(req: NextRequest): NextResponse | null {
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
export function cleanDetail(err: unknown): string {
  const e = err as { stderr?: unknown; message?: unknown };
  const raw = e?.stderr || e?.message || err;
  return String(raw)
    .replace(/\u001b\[[0-9;]*m/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 1000);
}

export interface CcusageBinary {
  cliPath: string;
  engine: ScanEngine;
}

let binaryPromise: Promise<CcusageBinary> | null = null;

/**
 * Resolves the ccusage CLI installed from package.json. The exact version is
 * pinned with lockfile integrity hashes, so scans never download or execute
 * unreviewed releases. Update deliberately with `npm install ccusage@<version>`.
 */
export async function resolveCcusage(): Promise<CcusageBinary> {
  const cached = binaryPromise;
  if (cached) {
    // The cached path goes stale if node_modules changes while the server runs.
    try {
      const binary = await cached;
      await access(binary.cliPath);
      return binary;
    } catch {
      binaryPromise = null;
    }
  }
  binaryPromise ??= (async () => {
    // We need an on-disk executable path, not the bundler's numeric module ID.
    const packagePath = requireFromHere.resolve(
      /* turbopackIgnore: true */ /* webpackIgnore: true */ "ccusage/package.json"
    );
    const packageDir = path.dirname(packagePath);
    const pkg = JSON.parse(
      await readFile(packagePath, "utf8")
    ) as { version?: unknown; bin?: unknown };
    const bin =
      typeof pkg.bin === "string"
        ? pkg.bin
        : (pkg.bin as Record<string, unknown> | undefined)?.ccusage;
    if (typeof pkg.version !== "string" || typeof bin !== "string") {
      throw new Error("node_modules/ccusage/package.json is missing version or bin");
    }
    const cliPath = path.join(packageDir, bin);
    await access(cliPath);
    return {
      cliPath,
      engine: { spec: `ccusage@${pkg.version}`, version: pkg.version },
    };
  })().catch((err) => {
    binaryPromise = null;
    throw err;
  });
  return binaryPromise;
}

/** Runs `ccusage --version` so a present-but-broken install is caught before a scan. */
export async function checkCcusage(): Promise<CcusageBinary> {
  const binary = await resolveCcusage();
  await execFileAsync(process.execPath, [binary.cliPath, "--version"], {
    timeout: 15_000,
    env: { ...process.env, FORCE_COLOR: "0", NO_COLOR: "1" },
  });
  return binary;
}

/**
 * Where each agent keeps its local data, relative to $HOME, plus the env var
 * ccusage honors to relocate it. Presence of a folder means the agent has been
 * used on this machine, not that it has billable usage in any date range.
 */
const PROVIDER_DATA_DIRS: Record<
  ProviderSlug,
  { env?: string; home: string[] }
> = {
  claude: { env: "CLAUDE_CONFIG_DIR", home: [".claude/projects", ".config/claude/projects"] },
  codex: { env: "CODEX_HOME", home: [".codex"] },
  opencode: { env: "OPENCODE_DATA_DIR", home: [".local/share/opencode"] },
  amp: { env: "AMP_DATA_DIR", home: [".local/share/amp"] },
  droid: { env: "DROID_SESSIONS_DIR", home: [".factory"] },
  codebuff: { env: "CODEBUFF_DATA_DIR", home: [".config/manicode"] },
  hermes: { env: "HERMES_HOME", home: [".hermes"] },
  pi: { env: "PI_AGENT_DIR", home: [".pi/agent/sessions"] },
  goose: { env: "GOOSE_PATH_ROOT", home: [".local/share/goose", ".config/goose"] },
  kilo: { env: "KILO_DATA_DIR", home: [".local/share/kilo"] },
  copilot: { env: "COPILOT_HOME", home: [".copilot"] },
  gemini: { env: "GEMINI_DATA_DIR", home: [".gemini"] },
  antigravity: {
    env: "ANTIGRAVITY_DATA_DIR",
    home: [".gemini/antigravity", ".config/antigravity"],
  },
  kimi: { env: "KIMI_DATA_DIR", home: [".kimi", ".kimi-code"] },
  qwen: { env: "QWEN_DATA_DIR", home: [".qwen"] },
  openclaw: { home: [".openclaw", ".clawdbot", ".moltbot", ".moldbot"] },
  grok: { env: "GROK_HOME", home: [".grok"] },
  zcode: { env: "ZCODE_HOME", home: [".zcode"] },
};

async function exists(target: string): Promise<boolean> {
  try {
    await access(target);
    return true;
  } catch {
    return false;
  }
}

/** Providers whose data folder exists on this machine. */
export async function detectProviders(): Promise<ProviderSlug[]> {
  const home = os.homedir();
  const found = await Promise.all(
    PROVIDERS.map(async (slug) => {
      const { env, home: dirs } = PROVIDER_DATA_DIRS[slug];
      const candidates = [
        ...(env ? (process.env[env] ?? "").split(",").filter(Boolean) : []),
        ...dirs.map((dir) => path.join(home, dir)),
      ];
      for (const candidate of candidates) {
        if (await exists(candidate)) return slug;
      }
      return null;
    })
  );
  return found.filter((slug): slug is ProviderSlug => slug !== null);
}
