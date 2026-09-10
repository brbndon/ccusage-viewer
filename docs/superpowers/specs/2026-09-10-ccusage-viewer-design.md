# ccusage Viewer — Design Spec
Date: 2026-09-10
Status: Approved in sections (architecture / components / data-flow)

## 1. Purpose
Brand-new local website to visualize `npx ccusage *` usage data. User runs dev server on the Mac that holds all ccusage data, opens webpage, presses Scan, server runs ccusage in background, web view processes and breaks down everything ccusage provides.

Success criteria:
- `npm run dev` spins up in <60s on Node 25 / npm 11.
- Pressing Scan returns real data from local `npx ccusage daily --json` matching CLI totals.
- Breakdown view covers daily, weekly, monthly, session, blocks (user chose All views).
- Supports `*` = daily/monthly/other ranges via view tabs + since/until filters.

## 2. Context
- Verified: ccusage 20.0.20 installed, `daily --json` returns `{daily[], totals{}}` with 136 rows on this machine. Row shape: agent, inputTokens, outputTokens, cacheCreationTokens, cacheReadTokens, totalTokens, totalCost, modelsUsed[], modelBreakdowns[{modelName, inputTokens, outputTokens, cache*, cost}], metadata{agents}, period. Session adds metadata{lastActivity, projectPath}. Blocks groups by billing blocks.
- Workspace: `/Users/brandon/websites/` (contains pushups/, thinking-view/). New app: `/Users/brandon/websites/ccusage-viewer/`.
- Constraints: local dev server only (approved). No auth, no deployment, no persistence. Server-side exec only via allowlisted API.

## 3. Approaches considered
- **A — Per-view Next.js API routes (CHOSEN):** `/api/scan?view=<name>` spawns `npx ccusage <view> --json`. Pros: 1:1 mapping to user's `npx ccusage *` mental model, independent loading per tab, easy since/until passthrough, transparent errors per view. Cons: N spawns for N tabs (mitigated by fetching active tab only + cache).
- B — Unified `--sections daily,weekly,monthly,session`: one spawn. Rejected: giant payload, harder per-view filtering, opaque failures.
- C — Vite SPA + Express sidecar: lighter bundle. Rejected: two processes to run, more wiring, weaker fit for "quickly spin up".

## 4. Architecture
- Framework: Next.js (App Router, TypeScript), Tailwind CSS, recharts for charts. Package manager: npm.
- Routes:
  - `app/page.tsx` — main UI: header, Scan button, view tabs (Daily/Weekly/Monthly/Session/Blocks), since/until date inputs, summary, charts, tables, footer with scannedAt.
  - `app/api/scan/route.ts` — GET handler. Validates `view ∈ {daily, weekly, monthly, session, blocks}`, optional `since`/`until` (YYYY-MM-DD or YYYYMMDD passed through), optional `timezone`. Uses `execFile('npx', ['ccusage', view, '--json', ...])` with 30s timeout, cwd = process.cwd(). Returns `{view, rows, totals, scannedAt}`.
  - `lib/ccusage.ts` — types for CcusageRow, ModelBreakdown, Totals; parse/normalize helpers per view key (daily vs weekly vs session vs blocks active).
  - `components/` — SummaryCards, CostChart, ModelTable, PeriodTable, ScanButton, ViewTabs.
- No database. In-memory client cache per view+filters. No background jobs.

## 5. Components & Breakdown view
For active view, render from `rows` + `totals`:
- Summary cards: totalCost ($, 2 decimals), totalTokens (compact), inputTokens, outputTokens, cacheReadTokens, cacheCreationTokens.
- Time-series chart (recharts Area/Bar): x=period (date or session id truncated / block start), y=cost + tokens (dual axis or toggle).
- Per-model aggregation: roll up all `modelBreakdowns` → table sorted by cost desc (model, input, output, cache read/creation, cost, share %).
- Per-period table: period, agents/modelsUsed, input/output/cache, totalTokens, totalCost; expandable row showing modelBreakdowns. Session view also shows projectPath + lastActivity. Blocks view shows block start/end + active flag if present.
- Totals footer + scannedAt timestamp + raw JSON toggle (<details>).
- States: idle (never scanned) → loading (spinner, disable Scan) → data → error with retry.

## 6. Data flow
1. User selects view tab + optional since/until, clicks Scan.
2. Client `fetch('/api/scan?view=daily&since=...')`.
3. Server allowlists params, spawns `npx ccusage <view> --json`, captures stdout, `JSON.parse`, extracts rows array (key = view name, e.g. `daily`) + `totals`.
4. Server responds JSON; client normalizes, updates cache, renders.
5. Switching tabs uses cache if same filters; Re-scan forces refetch. Future: Scan All button fetches 5 views in parallel (v2, out of scope for v1 but API supports it).

## 7. Error handling
- Invalid view → 400 with message.
- npx/ccusage missing → 500 with hint `npm i -g ccusage` / check PATH, shown inline.
- Timeout (>30s) → 504 with retry.
- Bad JSON / empty → 500 with stderr excerpt (truncated 500 chars).
- Client: error banner per tab, retains last good data, Retry button re-calls same query.
- Security: no arbitrary command execution — view allowlist only; since/until validated by regex `^\d{4}-?\d{2}-?\d{2}$`; no secrets; local-only documented in README (do not deploy without auth).

## 8. Testing
- `npm run dev` smoke: page loads, Scan daily returns 200 and totals match `npx ccusage daily --json` totals.
- Manual matrix: Scan each of daily/weekly/monthly/session/blocks; verify row counts >0 where CLI has data; verify since/until filters narrow results.
- Type check: `npm run build` / `tsc --noEmit` passes.
- Out of scope: automated e2e, unit tests for charts (v1 manual only).

## 9. Out of scope / v2
- Scan All + auto-refresh, --by-agent breakdowns, cost-mode/breakdown flags for blocks, export CSV, dark mode polish, deployment/auth, persistent history.

## Spec self-review
- No TBDs. Sections consistent: All views = 5 tabs; API allowlist matches tabs; types cover session metadata and blocks fields.
- Scope fits single implementation plan (one Next.js app, one API route, one page + ~5 components).
- Ambiguities resolved: `npx ccusage` (not pinned version) to respect local 20.0.20; timeout 30s; date format passthrough.
