# ccusage Viewer

Local Next.js dashboard for auditing AI coding-tool usage and spend on this Mac, built on [`ccusage`](https://github.com/ryoppippi/ccusage) (Claude Code, Codex, OpenCode, Amp, Gemini CLI, Copilot CLI, and more).

## Quick start

Requires Node.js 20.9 or newer.

```bash
git clone <repo-url> ccusage-viewer
cd ccusage-viewer
npm run setup   # installs dependencies (including ccusage), then starts the app
```

`ccusage` is installed by `npm install`; no separate global install is needed. If it is missing, the page says so before you scan and shows the command to run. Next time, `npm run dev` is enough.

Open http://localhost:3000. On first launch the viewer pre-selects the agents it finds data folders for (Claude Code, Codex, OpenCode, and others) and a 30-day range. Pick a view (Daily / Weekly / Monthly / Session / Blocks), adjust providers or dates, then press **Scan Usage** (or ⌘ Enter). Provider-scoped scans show each provider finishing as it completes.

## How it works

- `GET /api/scan` runs the `ccusage` CLI installed in `node_modules` and returns normalized rows, totals, and spend per agent and model.
- **Default providers** (everything except Antigravity, which is slow) run one `ccusage <provider> <view>` per provider in parallel. If one provider fails, the rest still render with a warning.
- **All incl. slow** runs a single unified scan, with `--by-agent` for Daily, Weekly, and Monthly.
- Results can be filtered by model and exported as CSV or a Markdown summary.
- **Saved scan**: every successful scan replaces `.cache/last-scan.json` (git-ignored, one scan only). The page opens on it, labelled with when it was taken, so you can read your usage without scanning; press **Scan Usage** to update it. When the server starts it repeats that last scan in the background (rolling ranges like "30 days" move forward to today), or on first run scans the agents it finds with a 30-day range. The page picks up the refreshed scan when it finishes. `GET /api/cache` returns `{ cached, refreshing }`.

### API

`GET /api/scan?view=daily&providers=claude,codex&since=2026-09-01&until=2026-09-30`

| Param | Values |
| --- | --- |
| `view` | `daily` (default), `weekly`, `monthly`, `session`, `blocks` |
| `providers` | Comma-separated provider slugs, `all` for the unified scan, or omitted for the default set |
| `since` / `until` | `YYYY-MM-DD` or `YYYYMMDD`, inclusive |

Add `stream=1` for newline-delimited JSON progress events (`start`, one `provider` per finished provider, then a final `result` or `error` carrying the same body as the plain form). `GET /api/status` reports whether ccusage runs and which agents have local data folders.

Returns `{ view, rows, totals, scannedAt, engine, providers, warnings? }`. Only one scan runs at a time; starting a new scan cancels the previous one.

## Data notes

- **Blocks** (5-hour billing windows) are Claude-only and have no per-model cost split.
- **Codex per-model costs are estimates** (marked ≈) in provider-scoped scans. Codex reports cost per period, so the viewer splits it by token share. Use **All incl. slow** for exact per-model costs.
- **Sessions** are ordered by last activity. Claude sessions show their project path.
- **Token totals** retain the CLI's canonical totals, including usage absent from model breakdowns. Codex reasoning counts are a subset of output tokens and are shown separately when reported; unified calendar scans omit that detail. Model filters exclude usage that cannot be assigned to a model and disclose the excluded amounts. Costs and rates derived from estimated model splits retain the ≈ marker.
- **Exports** preserve partial-result warnings and distinguish requested from included providers in Markdown. CSV includes reported reasoning tokens, row type, scan status, failed providers, and notes. `unallocated` rows preserve usage without model attribution; `aggregate` rows have no per-model split; `warning` rows contain zero usage and describe failed providers. Sum `Total Tokens` and `Cost USD` across usage rows for the displayed totals. Reported reasoning is a non-additive detail; zero means none reported, including scans that omit that detail.

## Updating ccusage

`ccusage` is pinned to an exact version in `package.json`, so scans never download or run an unreviewed release. To update:

```bash
npm install --save-exact ccusage@<version>
```

## Security

The scan API runs local commands and returns private usage data, so it is local-only:

- `npm run dev` / `npm start` bind to `127.0.0.1`, not your network.
- The API rejects requests not addressed to `localhost`/`127.0.0.1`, and any cross-site or cross-origin request, so other websites and DNS-rebinding attacks cannot trigger scans.

Do not deploy this or expose it with `-H 0.0.0.0`.
