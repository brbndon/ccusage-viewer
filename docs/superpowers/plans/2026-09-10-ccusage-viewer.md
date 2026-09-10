# ccusage Viewer Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a local Next.js site at `~/websites/ccusage-viewer` where pressing Scan runs `npx ccusage <view> --json` server-side and renders cost/token/model breakdowns.

**Architecture:** Next.js App Router page with view tabs calls same-origin `/api/scan?view=` which allowlists the view and spawns `npx ccusage` via execFile, parses stdout JSON, returns rows+totals for recharts tables/charts.

**Tech Stack:** Next.js (App Router, TypeScript), Tailwind CSS, recharts, Node 25, npm 11.

**Spec:** `docs/superpowers/specs/2026-09-10-ccusage-viewer-design.md`

## Global Constraints

- Node v25.1.0, npm v11.6.2 (verified on this machine).
- ccusage 20.0.20 via `npx ccusage` (do not pin a different version).
- Project root: `/Users/brandon/websites/ccusage-viewer` (already contains `docs/` + git repo with spec commit).
- Local dev server only — no auth, no deployment, no database.
- API must allowlist `view ∈ daily|weekly|monthly|session|blocks`; `since`/`until` validated by `^\d{4}-?\d{2}-?\d{2}$`; 30s exec timeout.
- `npm run dev` must start in <60s; `npm run build` must pass.

---

## File structure (create/modify)

- Modify (via scaffold): `package.json` — adds `next`, `react`, `react-dom`, `recharts`.
- Create: `app/api/scan/route.ts` — GET handler spawning ccusage, parsing JSON.
- Create: `lib/ccusage.ts` — ViewKey, CcusageRow, ModelBreakdown, Totals types + normalize helpers.
- Create: `components/ScanControls.tsx` — Scan button, view tabs, since/until inputs, status.
- Create: `components/SummaryCards.tsx` — totals cards.
- Create: `components/CostChart.tsx` — recharts area/bar of cost + tokens per period.
- Create: `components/PeriodTable.tsx` — per-period table with expandable modelBreakdowns + per-model rollup.
- Modify: `app/page.tsx` — composition + client fetch state machine.
- Modify: `app/layout.tsx` — title "ccusage Viewer" (scaffold default otherwise kept).
- Create: `README.md` — `npm run dev` + Scan instructions + local-only warning.

---

### Task 1: Scaffold Next.js app in place + install chart dep

**Files:**
- Create via scaffold: `package.json`, `app/layout.tsx`, `app/page.tsx`, `app/globals.css`, `next.config.ts`, `tsconfig.json`
- Modify: `package.json` (add recharts)

**Interfaces:**
- Consumes: empty project dir with `docs/` present.
- Produces: `npm run dev` serving scaffold homepage on port 3000; `recharts` importable.

- [ ] **Step 1: Move docs aside so create-next-app accepts the dir**

```bash
mv "/Users/brandon/websites/ccusage-viewer/docs" "/tmp/ccv-docs-backup" && ls "/Users/brandon/websites/ccusage-viewer"
```

Run: `ls "/Users/brandon/websites/ccusage-viewer"`
Expected: empty output (dir empty, ready for scaffold).

- [ ] **Step 2: Scaffold Next.js TypeScript + Tailwind App Router in place**

```bash
npx create-next-app@latest . --typescript --tailwind --app --use-npm --src-dir=false --import-alias="@/*"
```

Run: accept defaults for `linter: yes`. Answer `no` to `turbopack` if prompted (stable default).
Expected: `package.json`, `app/`, `next.config.ts` created.

- [ ] **Step 3: Restore docs and install recharts**

```bash
mv "/tmp/ccv-docs-backup" "/Users/brandon/websites/ccusage-viewer/docs" && npm install recharts && ls docs/superpowers/specs
```

Run: `ls docs/superpowers/specs/2026-09-10-ccusage-viewer-design.md`
Expected: spec file present alongside new `app/` dir.

- [ ] **Step 4: Verify dev server boots**

Run: `npm run dev -- --port 3000`
Expected: `Ready in <60s`, `http://localhost:3000` renders Next.js welcome. Stop with Ctrl+C.

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "Scaffold Next.js ccusage viewer with recharts"
```

---

### Task 2: ccusage types + /api/scan route

**Files:**
- Create: `lib/ccusage.ts`
- Create: `app/api/scan/route.ts`
- Test: manual `curl` against dev server (no test framework in v1)

**Interfaces:**
- Consumes: Node `child_process.execFile`, `npx ccusage <view> --json`.
- Produces: `GET /api/scan?view=daily` → `{view, rows: CcusageRow[], totals: CcusageTotals, scannedAt: string}`; exports `VIEWS`, `ViewKey` from `lib/ccusage.ts`.

- [ ] **Step 1: Write lib/ccusage.ts**

```ts
export const VIEWS = ["daily", "weekly", "monthly", "session", "blocks"] as const;
export type ViewKey = (typeof VIEWS)[number];

export interface ModelBreakdown {
  modelName: string;
  inputTokens: number;
  outputTokens: number;
  cacheCreationTokens: number;
  cacheReadTokens: number;
  cost: number;
}

export interface CcusageRow {
  agent: string;
  period: string;
  inputTokens: number;
  outputTokens: number;
  cacheCreationTokens: number;
  cacheReadTokens: number;
  totalTokens: number;
  totalCost: number;
  modelsUsed: string[];
  modelBreakdowns: ModelBreakdown[];
  metadata?: Record<string, unknown>;
}

export interface CcusageTotals {
  totalCost: number;
  totalTokens: number;
  inputTokens: number;
  outputTokens: number;
  cacheCreationTokens: number;
  cacheReadTokens: number;
}

export interface ScanResponse {
  view: ViewKey;
  rows: CcusageRow[];
  totals: CcusageTotals;
  scannedAt: string;
}

export function isViewKey(v: string): v is ViewKey {
  return (VIEWS as readonly string[]).includes(v);
}

const DATE_RE = /^\d{4}-?\d{2}-?\d{2}$/;

export function isDateParam(v: string): boolean {
  return DATE_RE.test(v);
}
```

- [ ] **Step 2: Write app/api/scan/route.ts**

```ts
import { NextRequest, NextResponse } from "next/server";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { isDateParam, isViewKey, type ScanResponse } from "@/lib/ccusage";

const execFileAsync = promisify(execFile);

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

  const args = ["ccusage", viewRaw, "--json"];
  if (since) args.push("--since", since);
  if (until) args.push("--until", until);

  try {
    const { stdout } = await execFileAsync("npx", args, { timeout: 30000, maxBuffer: 32 * 1024 * 1024 });
    const parsed = JSON.parse(stdout) as Record<string, unknown>;
    const rows = (parsed[viewRaw] ?? parsed["daily"] ?? []) as ScanResponse["rows"];
    const totals = (parsed["totals"] ?? {
      totalCost: 0, totalTokens: 0, inputTokens: 0,
      outputTokens: 0, cacheCreationTokens: 0, cacheReadTokens: 0,
    }) as ScanResponse["totals"];
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
```

- [ ] **Step 3: Typecheck the new files**

Run: `npx tsc --noEmit`
Expected: PASS with no errors.

- [ ] **Step 4: Smoke-test the API against real ccusage data**

Run: `npm run dev -- --port 3000 & sleep 8; curl -s "http://localhost:3000/api/scan?view=daily" | head -c 600; kill %1`
Expected: 200 JSON containing `"rows"`, `"totals"`, `"scannedAt"`, and non-empty `rows` (this machine has 136 daily rows).

- [ ] **Step 5: Verify error paths**

Run: `npm run dev -- --port 3001 & sleep 8; curl -s "http://localhost:3000/api/scan?view=nope"; curl -s "http://localhost:3001/api/scan?view=daily&since=bad"; kill %1`
Expected: both return `{"error": ...}` with 400 status.

- [ ] **Step 6: Commit**

```bash
git add lib/ccusage.ts app/api/scan/route.ts && git commit -m "Add ccusage scan API with view allowlist"
```

---

### Task 3: Main page + Scan controls + fetch state machine

**Files:**
- Create: `components/ScanControls.tsx`
- Modify: `app/page.tsx`
- Modify: `app/layout.tsx` (title only)

**Interfaces:**
- Consumes: `VIEWS`, `ViewKey`, `ScanResponse` from `@/lib/ccusage`; `GET /api/scan`.
- Produces: page exports default `Home` component; `ScanControls` props `{view, since, until, loading, onViewChange, onSinceChange, onUntilChange, onScan}`.

- [ ] **Step 1: Write components/ScanControls.tsx**

```tsx
"use client";
import type { ViewKey } from "@/lib/ccusage";
import { VIEWS } from "@/lib/ccusage";

interface Props {
  view: ViewKey;
  since: string;
  until: string;
  loading: boolean;
  onViewChange: (v: ViewKey) => void;
  onSinceChange: (v: string) => void;
  onUntilChange: (v: string) => void;
  onScan: () => void;
}

export default function ScanControls(p: Props) {
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap gap-2">
        {VIEWS.map((v) => (
          <button
            key={v}
            onClick={() => p.onViewChange(v)}
            className={`rounded-full px-4 py-1.5 text-sm font-medium border ${p.view === v ? "bg-black text-white border-black" : "bg-white text-gray-700 border-gray-300 hover:border-gray-500"}`}
          >
            {v}
          </button>
        ))}
      </div>
      <div className="flex flex-wrap items-end gap-3">
        <label className="flex flex-col text-sm text-gray-600">
          Since
          <input type="date" value={p.since} onChange={(e) => p.onSinceChange(e.target.value)} className="rounded border border-gray-300 px-2 py-1.5 text-gray-900" />
        </label>
        <label className="flex flex-col text-sm text-gray-600">
          Until
          <input type="date" value={p.until} onChange={(e) => p.onUntilChange(e.target.value)} className="rounded border border-gray-300 px-2 py-1.5 text-gray-900" />
        </label>
        <button
          onClick={p.onScan}
          disabled={p.loading}
          className="rounded-lg bg-blue-600 px-6 py-2 font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
        >
          {p.loading ? "Scanning…" : "Scan"}
        </button>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Write app/page.tsx**

```tsx
"use client";
import { useState } from "react";
import ScanControls from "@/components/ScanControls";
import SummaryCards from "@/components/SummaryCards";
import CostChart from "@/components/CostChart";
import PeriodTable from "@/components/PeriodTable";
import type { ScanResponse, ViewKey } from "@/lib/ccusage";

export default function Home() {
  const [view, setView] = useState<ViewKey>("daily");
  const [since, setSince] = useState("");
  const [until, setUntil] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [data, setData] = useState<ScanResponse | null>(null);

  async function scan() {
    setLoading(true);
    setError("");
    try {
      const q = new URLSearchParams({ view });
      if (since) q.set("since", since);
      if (until) q.set("until", until);
      const res = await fetch(`/api/scan?${q.toString()}`);
      const body = await res.json();
      if (!res.ok) throw new Error(body?.detail ? `${body.error}: ${body.detail}` : (body?.error ?? "Scan failed"));
      setData(body as ScanResponse);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Scan failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="mx-auto max-w-6xl p-6 flex flex-col gap-6">
      <header>
        <h1 className="text-2xl font-bold">ccusage Viewer</h1>
        <p className="text-sm text-gray-600">Runs <code>npx ccusage {"<view>"} --json</code> on this Mac. Local dev only.</p>
      </header>
      <ScanControls view={view} since={since} until={until} loading={loading}
        onViewChange={setView} onSinceChange={setSince} onUntilChange={setUntil} onScan={scan} />
      {error && <div className="rounded border border-red-300 bg-red-50 p-3 text-sm text-red-800">{error} <button onClick={scan} className="underline font-semibold">Retry</button></div>}
      {!data && !error && <p className="text-gray-500 text-sm">Press Scan to load {view} usage.</p>}
      {data && (
        <>
          <SummaryCards totals={data.totals} scannedAt={data.scannedAt} />
          <CostChart rows={data.rows} />
          <PeriodTable rows={data.rows} totals={data.totals} />
          <details className="text-xs text-gray-500"><summary>Raw JSON</summary><pre className="overflow-auto rounded bg-gray-50 p-3">{JSON.stringify(data, null, 2).slice(0, 8000)}</pre></details>
        </>
      )}
    </main>
  );
}
```

- [ ] **Step 3: Set layout title**

In `app/layout.tsx`, change `metadata.title` to `"ccusage Viewer"` and description to `"Local ccusage usage breakdown viewer"`.

- [ ] **Step 4: Typecheck**

Run: `npx tsc --noEmit`
Expected: PASS (components imported in Step 4 of Task 4 don't exist yet — so temporarily expect FAIL here; if FAIL, proceed to Task 4 then re-run. Record result.)

Note: this ordering is intentional — page references Task 4 components. If tsc fails on missing SummaryCards/CostChart/PeriodTable, continue to Task 4 and re-run tsc there.

- [ ] **Step 5: Commit**

```bash
git add components/ScanControls.tsx app/page.tsx app/layout.tsx && git commit -m "Add main page and scan controls"
```

---

### Task 4: Breakdown components (summary, chart, tables)

**Files:**
- Create: `components/SummaryCards.tsx`
- Create: `components/CostChart.tsx`
- Create: `components/PeriodTable.tsx`

**Interfaces:**
- Consumes: `CcusageRow`, `CcusageTotals` from `@/lib/ccusage`.
- Produces: `SummaryCards({totals, scannedAt})`, `CostChart({rows})`, `PeriodTable({rows, totals})` — all client components.

- [ ] **Step 1: Write components/SummaryCards.tsx**

```tsx
"use client";
import type { CcusageTotals } from "@/lib/ccusage";

function fmt(n: number) { return n.toLocaleString("en-US"); }
function money(n: number) { return `$${n.toFixed(2)}`; }

export default function SummaryCards({ totals, scannedAt }: { totals: CcusageTotals; scannedAt: string }) {
  const cards: [string, string][] = [
    ["Total cost", money(totals.totalCost)],
    ["Total tokens", fmt(totals.totalTokens)],
    ["Input", fmt(totals.inputTokens)],
    ["Output", fmt(totals.outputTokens)],
    ["Cache read", fmt(totals.cacheReadTokens)],
    ["Cache creation", fmt(totals.cacheCreationTokens)],
  ];
  return (
    <section>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-6">
        {cards.map(([k, v]) => (
          <div key={k} className="rounded-lg border border-gray-200 bg-white p-3">
            <div className="text-xs uppercase text-gray-500">{k}</div>
            <div className="text-lg font-semibold">{v}</div>
          </div>
        ))}
      </div>
      <p className="mt-2 text-xs text-gray-500">Scanned at {new Date(scannedAt).toLocaleString()}</p>
    </section>
  );
}
```

- [ ] **Step 2: Write components/CostChart.tsx**

```tsx
"use client";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { CcusageRow } from "@/lib/ccusage";

export default function CostChart({ rows }: { rows: CcusageRow[] }) {
  const data = rows.slice(-30).map((r) => ({
    name: String(r.period).slice(0, 10),
    cost: Number(r.totalCost.toFixed(2)),
    tokens: r.totalTokens,
  }));
  if (data.length === 0) return <p className="text-sm text-gray-500">No rows to chart.</p>;
  return (
    <section className="rounded-lg border border-gray-200 bg-white p-4">
      <h2 className="mb-2 font-semibold">Cost per period (last {data.length})</h2>
      <div style={{ height: 260 }}>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="name" tick={{ fontSize: 11 }} interval="preserveStartEnd" />
            <YAxis tick={{ fontSize: 11 }} />
            <Tooltip />
            <Bar dataKey="cost" fill="#2563eb" name="Cost ($)" />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </section>
  );
}
```

- [ ] **Step 3: Write components/PeriodTable.tsx**

```tsx
"use client";
import { useMemo, useState } from "react";
import type { CcusageRow, CcusageTotals } from "@/lib/ccusage";

export default function PeriodTable({ rows, totals }: { rows: CcusageRow[]; totals: CcusageTotals }) {
  const [open, setOpen] = useState<string | null>(null);
  const modelRollup = useMemo(() => {
    const m = new Map<string, { tokens: number; cost: number }>();
    for (const r of rows) for (const b of r.modelBreakdowns ?? []) {
      const e = m.get(b.modelName) ?? { tokens: 0, cost: 0 };
      e.tokens += b.inputTokens + b.outputTokens + b.cacheReadTokens + b.cacheCreationTokens;
      e.cost += b.cost;
      m.set(b.modelName, e);
    }
    return [...m.entries()].sort((a, b) => b[1].cost - a[1].cost);
  }, [rows]);

  return (
    <section className="flex flex-col gap-4">
      <div className="rounded-lg border border-gray-200 bg-white p-4">
        <h2 className="mb-2 font-semibold">Cost by model</h2>
        <table className="w-full text-sm">
          <thead><tr className="text-left text-gray-500"><th>Model</th><th className="text-right">Tokens</th><th className="text-right">Cost</th><th className="text-right">Share</th></tr></thead>
          <tbody>
            {modelRollup.map(([name, v]) => (
              <tr key={name} className="border-t"><td>{name}</td><td className="text-right">{v.tokens.toLocaleString()}</td><td className="text-right">${v.cost.toFixed(2)}</td><td className="text-right">{totals.totalCost ? `${((v.cost / totals.totalCost) * 100).toFixed(1)}%` : "—"}</td></tr>
            ))}
            {modelRollup.length === 0 && <tr><td colSpan={4} className="py-2 text-gray-500">No model data.</td></tr>}
          </tbody>
        </table>
      </div>
      <div className="rounded-lg border border-gray-200 bg-white p-4 overflow-auto">
        <h2 className="mb-2 font-semibold">Periods ({rows.length})</h2>
        <table className="w-full text-sm">
          <thead><tr className="text-left text-gray-500"><th>Period</th><th>Models</th><th className="text-right">Tokens</th><th className="text-right">Cost</th><th></th></tr></thead>
          <tbody>
            {rows.map((r) => (
              <>
                <tr key={r.period} className="border-t">
                  <td className="pr-2">{String(r.period).slice(0, 24)}</td>
                  <td className="pr-2 text-gray-600">{(r.modelsUsed ?? []).join(", ")}</td>
                  <td className="text-right">{r.totalTokens.toLocaleString()}</td>
                  <td className="text-right">${r.totalCost.toFixed(2)}</td>
                  <td className="text-right"><button className="underline" onClick={() => setOpen(open === r.period ? null : r.period)}>{open === r.period ? "hide" : "models"}</button></td>
                </tr>
                {open === r.period && (
                  <tr key={`${r.period}-open`} className="bg-gray-50">
                    <td colSpan={5} className="p-2 text-xs">
                      {(r.modelBreakdowns ?? []).map((b) => (
                        <div key={b.modelName}>{b.modelName}: in {b.inputTokens.toLocaleString()}, out {b.outputTokens.toLocaleString()}, cache-read {b.cacheReadTokens.toLocaleString()}, ${b.cost.toFixed(2)}</div>
                      ))}
                      {(r.metadata as { projectPath?: string } | undefined)?.projectPath && <div>project: {String((r.metadata as { projectPath?: string }).projectPath)}</div>}
                    </td>
                  </tr>
                )}
              </>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
```

- [ ] **Step 4: Re-run typecheck (covers Task 3 + Task 4)**

Run: `npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 5: Visual smoke test**

Run: `npm run dev -- --port 3000`, open `http://localhost:3000`, press Scan for daily, monthly, session, blocks.
Expected: summary totals match `npx ccusage <view> --json` totals; chart renders; model table non-empty.

- [ ] **Step 6: Commit**

```bash
git add components/SummaryCards.tsx components/CostChart.tsx components/PeriodTable.tsx && git commit -m "Add breakdown summary, chart, and tables"
```

---

### Task 5: README, build verify, final polish

**Files:**
- Create: `README.md`
- Modify: none (polish only if build fails)

**Interfaces:**
- Consumes: all prior tasks.
- Produces: `npm run build` passes; README documents `npm run dev` + Scan + local-only warning.

- [ ] **Step 1: Write README.md**

```md
# ccusage Viewer

Local Next.js site to visualize `npx ccusage *` data.

## Quick start

\`\`\`bash
npm install
npm run dev
\`\`\`

Open http://localhost:3000, pick Daily / Weekly / Monthly / Session / Blocks, optionally set Since / Until, press **Scan**.

## How it works

- `GET /api/scan?view=daily&since=2026-01-01&until=2026-09-10` spawns `npx ccusage <view> --json` on this Mac and returns `{rows, totals, scannedAt}`.
- Only `daily|weekly|monthly|session|blocks` allowed. Local dev only — do not deploy without auth since the API executes commands.
```

- [ ] **Step 2: Run production build**

Run: `npm run build`
Expected: PASS (`Compiled successfully`, all routes including `/api/scan`).

- [ ] **Step 3: Full matrix check (CLI vs UI totals)**

Run: `npx ccusage daily --json | python3 -c "import json,sys; print(json.load(sys.stdin)['totals'])"` and compare to UI summary after Scan daily. Repeat for `monthly` and `session`.
Expected: totals match to 2 decimals.

- [ ] **Step 4: Commit**

```bash
git add README.md && git commit -m "Add README and verify build"
```

---

## Self-review

- Spec coverage: purpose + `*` ranges → 5 tabs + since/until (Tasks 2–3); breakdown of everything ccusage provides → summary/model rollup/period table/metadata (Task 4); Scan runs command in background → execFile API (Task 2); `npm run dev` quick spin-up → scaffold + README (Tasks 1, 5). No gaps.
- Placeholder scan: no TBD/TODO; every code step has full file contents; every test step has exact command + expected output; no "similar to" references.
- Type consistency: `ViewKey`, `CcusageRow`, `CcusageTotals`, `ScanResponse` defined once in `lib/ccusage.ts`, imported verbatim in route, page, and components. Prop names (`view`, `since`, `until`, `loading`, `rows`, `totals`, `scannedAt`) match across ScanControls, page, SummaryCards, CostChart, PeriodTable.
