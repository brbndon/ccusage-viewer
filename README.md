# ccusage Viewer

A local dashboard for reviewing AI coding-tool usage and spend on this Mac. It uses the pinned `ccusage` CLI and supports Claude Code, Codex, OpenCode, Amp, Gemini CLI, Copilot CLI, and other providers supported by `ccusage`.

## Quick start

Requires Node.js 20.9 or newer.

```bash
git clone https://github.com/brbndon/ccusage-viewer.git
cd ccusage-viewer
npm run setup
```

`npm run setup` installs dependencies and starts the local server. Open http://localhost:3000. You can also run `npm install` once and use `npm run dev` on later starts.

## What you can do

- View daily, weekly, monthly, session, or 5-hour block usage.
- Filter by provider, model, and date range.
- Review saved scans and year-long token activity.
- Export reports as CSV or Markdown.

Provider-specific Codex per-model costs are estimates. **All incl. slow** uses the unified scan for exact provider costs.

## Privacy

The app reads usage data already on this Mac and saves its latest scan in the ignored `.cache/` directory. It does not upload usage data. The server binds to `127.0.0.1` only; do not deploy it or expose it on your network.

## Development

```bash
npm run lint
npm run build
```

The `ccusage` version is pinned in `package.json`. Update it with `npm install --save-exact ccusage@<version>`.