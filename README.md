# ccusage Viewer

Local Next.js dashboard for auditing AI coding-tool usage and spend on this Mac, built on [`ccusage`](https://github.com/ryoppippi/ccusage) (Claude Code, Codex, OpenCode, Amp, Gemini CLI, Copilot CLI, and more).

## Quick start

```bash
npm install
npm run dev
```

Open http://localhost:3000, pick providers, a view (Daily / Weekly / Monthly / Session / Blocks), and an optional date range, then press **Scan Usage** (or ⌘ Enter).

## How it works

- `GET /api/scan` runs the `ccusage` CLI installed in `node_modules` and returns normalized rows, totals, and spend per agent and model.
- **Default providers** (everything except Antigravity, which is slow) run one `ccusage <provider> <view>` per provider in parallel. If one provider fails, the rest still render with a warning.
- **All incl. slow** runs a single unified `ccusage <view> --by-agent` scan.
- Results can be filtered by model and exported as CSV or a Markdown summary.

### API

`GET /api/scan?view=daily&providers=claude,codex&since=2026-09-01&until=2026-09-30`

| Param | Values |
| --- | --- |
| `view` | `daily` (default), `weekly`, `monthly`, `session`, `blocks` |
| `providers` | Comma-separated provider slugs, `all` for the unified scan, or omitted for the default set |
| `since` / `until` | `YYYY-MM-DD` or `YYYYMMDD`, inclusive |

Returns `{ view, rows, totals, scannedAt, engine, providers, warnings? }`. Only one scan runs at a time; starting a new scan cancels the previous one.

## Data notes

- **Blocks** (5-hour billing windows) are Claude-only and have no per-model cost split.
- **Codex per-model costs are estimates** (marked ≈) in provider-scoped scans. Codex reports cost per period, so the viewer splits it by token share. Use **All incl. slow** for exact per-model costs.
- **Sessions** are ordered by last activity. Claude sessions show their project path.

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
