import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import { PROVIDERS, VIEW_SUPPORT, type ProviderSlug } from "@/lib/ccusage";
import { normalizeProviderPayload } from "@/lib/ccusage-normalize";
import { detectProviders, resolveCcusage } from "@/lib/ccusage-server";
import { runCcusage } from "@/lib/scan-runner";

/** One calendar day with usage; quiet days are left out. */
export interface ActivityDay {
  date: string;
  tokens: number;
  cost: number;
  costEstimated?: boolean;
}

export interface LongestSession {
  minutes: number;
  start: string;
  end: string;
  agent: string;
}

/**
 * All-history usage for the activity graph. It is independent of the scan's
 * date range and model filter, and is saved separately from the last scan.
 */
export interface ActivityData {
  version: 1;
  generatedAt: string;
  /** Agents that returned usage. */
  providers: ProviderSlug[];
  days: ActivityDay[];
  longestSession: LongestSession | null;
}

const CACHE_DIR = path.join(process.cwd(), ".cache");
const CACHE_FILE = path.join(CACHE_DIR, "activity.json");
const DEFAULT_PROVIDERS: ProviderSlug[] = PROVIDERS.filter((p) => p !== "antigravity");
const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;

function isActivityData(v: unknown): v is ActivityData {
  if (typeof v !== "object" || v === null) return false;
  const a = v as Record<string, unknown>;
  return (
    a.version === 1 &&
    typeof a.generatedAt === "string" &&
    Array.isArray(a.providers) &&
    Array.isArray(a.days) &&
    a.days.every((d) => {
      const day = d as Partial<ActivityDay> | null;
      return (
        typeof day?.date === "string" &&
        DAY_RE.test(day.date) &&
        typeof day.tokens === "number" &&
        typeof day.cost === "number"
      );
    })
  );
}

export async function readActivityCache(): Promise<ActivityData | null> {
  try {
    const parsed: unknown = JSON.parse(await readFile(CACHE_FILE, "utf8"));
    return isActivityData(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

async function saveActivityCache(activity: ActivityData): Promise<void> {
  const tmp = `${CACHE_FILE}.${process.pid}.${Date.now()}.tmp`;
  try {
    await mkdir(CACHE_DIR, { recursive: true });
    await writeFile(tmp, JSON.stringify(activity));
    await rename(tmp, CACHE_FILE);
  } catch (err) {
    console.warn("[ccusage-viewer] could not save the activity cache:", err);
  }
}

function minutesBetween(start: unknown, end: unknown): number | null {
  if (typeof start !== "string" || typeof end !== "string") return null;
  const ms = Date.parse(end) - Date.parse(start);
  return Number.isFinite(ms) && ms > 0 ? ms / 60_000 : null;
}

async function computeActivity(): Promise<ActivityData> {
  const { cliPath } = await resolveCcusage();
  const detected = await detectProviders();
  const candidates = DEFAULT_PROVIDERS.filter((p) => detected.includes(p));
  const signal = new AbortController().signal;
  const run = (provider: ProviderSlug, view: "daily" | "session") =>
    runCcusage(cliPath, [provider, view, "--json"], signal).then(
      (parsed) => normalizeProviderPayload(provider, view, parsed).rows
    );

  const daily = await Promise.allSettled(
    candidates
      .filter((p) => VIEW_SUPPORT[p].includes("daily"))
      .map(async (provider) => ({ provider, rows: await run(provider, "daily") }))
  );

  const byDay = new Map<string, ActivityDay>();
  const providers: ProviderSlug[] = [];
  for (const result of daily) {
    if (result.status !== "fulfilled") continue;
    const { provider, rows } = result.value;
    if (rows.length > 0) providers.push(provider);
    for (const row of rows) {
      if (!DAY_RE.test(row.period)) continue;
      const day = byDay.get(row.period) ?? { date: row.period, tokens: 0, cost: 0 };
      day.tokens += row.totalTokens;
      day.cost += row.totalCost;
      if (row.costEstimated) day.costEstimated = true;
      byDay.set(row.period, day);
    }
  }

  // Only some agents report when a session began, so this covers those.
  const sessions = await Promise.allSettled(
    providers
      .filter((p) => VIEW_SUPPORT[p].includes("session"))
      .map((provider) => run(provider, "session"))
  );
  let longestSession: LongestSession | null = null;
  for (const result of sessions) {
    if (result.status !== "fulfilled") continue;
    for (const row of result.value) {
      const start = row.metadata?.firstActivity;
      const end = row.metadata?.lastActivity;
      const minutes = minutesBetween(start, end);
      if (minutes !== null && (!longestSession || minutes > longestSession.minutes)) {
        longestSession = { minutes, start: start as string, end: end as string, agent: row.agent };
      }
    }
  }

  return {
    version: 1,
    generatedAt: new Date().toISOString(),
    providers,
    days: [...byDay.values()].filter((d) => d.tokens > 0).sort((a, b) => a.date.localeCompare(b.date)),
    longestSession,
  };
}

// Shared through globalThis: instrumentation and route handlers may be bundled separately.
const shared = globalThis as { __ccusageActivityRun?: Promise<ActivityData> };

/** Rebuilds and saves the activity data; concurrent callers share one run. */
export function refreshActivity(): Promise<ActivityData> {
  shared.__ccusageActivityRun ??= computeActivity()
    .then(async (activity) => {
      await saveActivityCache(activity);
      return activity;
    })
    .finally(() => {
      shared.__ccusageActivityRun = undefined;
    });
  return shared.__ccusageActivityRun;
}
